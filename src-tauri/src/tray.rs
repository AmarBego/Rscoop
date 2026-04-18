use crate::commands::settings;
use crate::icons::IconCache;
use crate::state::AppState;
use crate::utils::{get_scoop_app_shortcuts_with_path, launch_scoop_app, ScoopAppShortcut};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use tauri::{
    image::Image,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

/// Pending navigation hint, consumed by the frontend on window mount.
/// Used when the user clicks "Edit Tray Menu…" in the tray but the webview
/// is destroyed — the navigation event alone would be lost (nothing listens
/// until the new webview boots), so we stash the intent in state and the
/// freshly-loaded SettingsPage reads it on mount.
#[derive(Default)]
pub struct PendingNavigation(pub std::sync::Mutex<Option<String>>);

impl PendingNavigation {
    pub fn set(&self, tab: String) {
        *self.0.lock().unwrap() = Some(tab);
    }
    pub fn take(&self) -> Option<String> {
        self.0.lock().unwrap().take()
    }
}

#[tauri::command]
pub async fn consume_pending_settings_tab(app: tauri::AppHandle) -> Option<String> {
    app.state::<PendingNavigation>().take()
}

/// DTO passed to the frontend — mirrors `ScoopAppShortcut` plus an optional
/// PNG data URL for the app icon (extracted from the target exe).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayAppDto {
    pub name: String,
    pub display_name: String,
    pub target_path: String,
    pub working_directory: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon_data_url: Option<String>,
}

pub fn setup_system_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    // Create a shared map to store app shortcuts for menu events
    let shortcuts_map: Arc<Mutex<HashMap<String, ScoopAppShortcut>>> =
        Arc::new(Mutex::new(HashMap::new()));
    app.manage(shortcuts_map.clone());

    // Build the dynamic menu
    let menu = build_tray_menu(app, shortcuts_map.clone())?;

    let _tray = TrayIconBuilder::with_id("main")
        .tooltip("Rscoop - Scoop Package Manager")
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                show_or_create_main_window(app);
                // Re-warm manifest cache in the background in case it was invalidated
                let app_clone = app.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = crate::commands::search::warm_manifest_cache(app_clone).await {
                        log::warn!("Failed to re-warm manifest cache on tray restore: {}", e);
                    }
                });
            }
        })
        .on_menu_event(move |app, event| {
            let event_id = event.id().as_ref();
            match event_id {
                "quit" => {
                    app.exit(0);
                }
                "show" => {
                    show_or_create_main_window(app);
                    let app_clone = app.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(e) = crate::commands::search::warm_manifest_cache(app_clone).await {
                            log::warn!("Failed to re-warm manifest cache on show: {}", e);
                        }
                    });
                }
                "hide" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.destroy();
                    }
                }
                "refresh_apps" => {
                    // Clear icon cache so we re-extract in case the underlying
                    // exes have changed, then rebuild the menu.
                    app.state::<IconCache>().clear();
                    let app_handle = app.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(e) = refresh_tray_menu(&app_handle).await {
                            log::error!("Failed to refresh tray menu: {}", e);
                        }
                    });
                }
                "edit_tray" => {
                    // Store intent for the cold-start path (webview may be
                    // destroyed), then bring the window back. Frontend reads
                    // pending state on mount; if already alive, it reacts to
                    // the event emitted below.
                    app.state::<PendingNavigation>().set("tray".to_string());
                    show_or_create_main_window(app);
                    let _ = app.emit("navigate-to-settings-tab", "tray");
                }
                id if id.starts_with("app_") => {
                    // Handle Scoop app launches
                    let shortcuts_map =
                        app.state::<Arc<Mutex<HashMap<String, ScoopAppShortcut>>>>();
                    if let Ok(shortcuts) = shortcuts_map.inner().lock() {
                        if let Some(shortcut) = shortcuts.get(id) {
                            if let Err(e) =
                                launch_scoop_app(&shortcut.target_path, &shortcut.working_directory)
                            {
                                log::error!(
                                    "Failed to launch app {}: {}",
                                    shortcut.display_name,
                                    e
                                );
                            }
                        }
                    }
                }
                _ => {}
            }
        })
        .build(app)?;

    Ok(())
}

fn build_tray_menu(
    app: &tauri::AppHandle,
    shortcuts_map: Arc<Mutex<HashMap<String, ScoopAppShortcut>>>,
) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    // Basic menu items
    let show = tauri::menu::MenuItemBuilder::with_id("show", "Show Rscoop").build(app)?;
    let hide = tauri::menu::MenuItemBuilder::with_id("hide", "Hide Rscoop").build(app)?;
    let refresh_apps =
        tauri::menu::MenuItemBuilder::with_id("refresh_apps", "Refresh Apps").build(app)?;
    let edit_tray =
        tauri::menu::MenuItemBuilder::with_id("edit_tray", "Edit Tray Menu…").build(app)?;

    let mut menu_items: Vec<Box<dyn tauri::menu::IsMenuItem<tauri::Wry>>> = Vec::new();
    menu_items.push(Box::new(show));
    menu_items.push(Box::new(hide));

    // Get Scoop apps shortcuts using the app state
    let shortcuts_result = if let Some(app_state) = app.try_state::<AppState>() {
        let scoop_path = app_state.scoop_path();
        get_scoop_app_shortcuts_with_path(scoop_path.as_path())
    } else {
        // Fallback to automatic detection if state is not available
        crate::utils::get_scoop_app_shortcuts()
    };

    if let Ok(shortcuts) = shortcuts_result {
        // Apply user curation: filter hidden, split pinned from visible.
        let (pinned_set, hidden_set) = read_tray_prefs(app);
        let visible_shortcuts: Vec<ScoopAppShortcut> = shortcuts
            .into_iter()
            .filter(|s| !hidden_set.contains(&s.name))
            .collect();

        let mut pinned: Vec<ScoopAppShortcut> = visible_shortcuts
            .iter()
            .filter(|s| pinned_set.contains(&s.name))
            .cloned()
            .collect();
        let mut unpinned: Vec<ScoopAppShortcut> = visible_shortcuts
            .into_iter()
            .filter(|s| !pinned_set.contains(&s.name))
            .collect();
        pinned.sort_by(|a, b| a.display_name.to_lowercase().cmp(&b.display_name.to_lowercase()));
        unpinned.sort_by(|a, b| a.display_name.to_lowercase().cmp(&b.display_name.to_lowercase()));

        let has_any = !pinned.is_empty() || !unpinned.is_empty();
        if has_any {
            // Separator + header before apps
            let separator = tauri::menu::PredefinedMenuItem::separator(app)?;
            menu_items.push(Box::new(separator));
            let apps_label = tauri::menu::MenuItemBuilder::with_id("apps_label", "Scoop Apps")
                .enabled(false)
                .build(app)?;
            menu_items.push(Box::new(apps_label));

            if let Ok(mut map) = shortcuts_map.lock() {
                map.clear();

                let icon_cache = app.state::<IconCache>();
                let mut push_app_item =
                    |items: &mut Vec<Box<dyn tauri::menu::IsMenuItem<tauri::Wry>>>,
                     shortcut: &ScoopAppShortcut|
                     -> tauri::Result<()> {
                        let menu_id = format!("app_{}", shortcut.name);
                        map.insert(menu_id.clone(), shortcut.clone());

                        let cached = icon_cache.get_or_extract(&shortcut.target_path);
                        if let Some(ci) = cached {
                            let image = Image::new_owned(ci.rgba, ci.width, ci.height);
                            let item = tauri::menu::IconMenuItemBuilder::with_id(
                                &menu_id,
                                &shortcut.display_name,
                            )
                            .icon(image)
                            .build(app)?;
                            items.push(Box::new(item));
                        } else {
                            let item = tauri::menu::MenuItemBuilder::with_id(
                                &menu_id,
                                &shortcut.display_name,
                            )
                            .build(app)?;
                            items.push(Box::new(item));
                        }
                        Ok(())
                    };

                // Pinned group first
                for shortcut in &pinned {
                    push_app_item(&mut menu_items, shortcut)?;
                }

                // Separator between pinned and the rest if both non-empty
                if !pinned.is_empty() && !unpinned.is_empty() {
                    let sep = tauri::menu::PredefinedMenuItem::separator(app)?;
                    menu_items.push(Box::new(sep));
                }

                for shortcut in &unpinned {
                    push_app_item(&mut menu_items, shortcut)?;
                }
            }
        }
    } else if let Err(e) = shortcuts_result {
        log::warn!("Failed to get Scoop app shortcuts: {}", e);
    }

    // Add separator and refresh option
    let separator = tauri::menu::PredefinedMenuItem::separator(app)?;
    menu_items.push(Box::new(separator));
    menu_items.push(Box::new(edit_tray));
    menu_items.push(Box::new(refresh_apps));

    // Add quit option
    let separator2 = tauri::menu::PredefinedMenuItem::separator(app)?;
    let quit = tauri::menu::MenuItemBuilder::with_id("quit", "Quit").build(app)?;
    menu_items.push(Box::new(separator2));
    menu_items.push(Box::new(quit));

    // Build the menu
    let mut menu_builder = tauri::menu::MenuBuilder::new(app);
    for item in menu_items {
        menu_builder = menu_builder.item(&*item);
    }

    menu_builder.build()
}

/// Refresh the tray menu with updated Scoop apps
pub async fn refresh_tray_menu(app: &tauri::AppHandle) -> Result<(), String> {
    log::info!("Refreshing tray menu...");

    let shortcuts_map = app.state::<Arc<Mutex<HashMap<String, ScoopAppShortcut>>>>();

    // Rebuild the menu
    let new_menu = build_tray_menu(app, shortcuts_map.inner().clone())
        .map_err(|e| format!("Failed to build new menu: {}", e))?;

    // Update the tray icon menu
    if let Some(tray) = app.tray_by_id("main") {
        tray.set_menu(Some(new_menu))
            .map_err(|e| format!("Failed to set new menu: {}", e))?;
        log::info!("Tray menu refreshed successfully");
    } else {
        return Err("Tray icon not found".to_string());
    }

    Ok(())
}

/// Blocking version for use in threads
pub fn show_system_notification_blocking(app: &tauri::AppHandle) {
    log::info!("Displaying blocking native dialog for tray notification");

    // Show a nice native dialog with information about tray behavior
    let result = app
        .dialog()
        .message("Rscoop has been minimized to the system tray and will continue running in the background.\n\nYou can:\n• Click the tray icon to restore the window\n• Right-click the tray icon to access the context menu\n• Change this behavior in Settings > Window Behavior\n\nWhat would you like to do?")
        .title("Rscoop - Minimized to Tray")
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::OkCancelCustom("Close and Disable Tray".to_string(), "Keep in Tray".to_string()))
        .blocking_show();

    // If user chose to close and disable tray, disable the setting and exit
    if result {
        // Disable close to tray setting
        let _ = settings::set_config_value(
            app.clone(),
            "window.closeToTray".to_string(),
            serde_json::json!(false),
        );

        log::info!("User chose to disable tray functionality. Exiting application.");
        app.exit(0);
    }
}

#[tauri::command]
pub async fn refresh_tray_apps_menu(app: tauri::AppHandle) -> Result<(), String> {
    refresh_tray_menu(&app).await
}

/// Returns the list of installed Scoop app shortcuts (with extracted icons
/// as PNG data URLs) — used by the Tray Menu settings page.
#[tauri::command]
pub async fn get_tray_apps(app: tauri::AppHandle) -> Result<Vec<TrayAppDto>, String> {
    let shortcuts = if let Some(app_state) = app.try_state::<AppState>() {
        let scoop_path = app_state.scoop_path();
        get_scoop_app_shortcuts_with_path(scoop_path.as_path())
    } else {
        crate::utils::get_scoop_app_shortcuts()
    }?;
    let mut sorted = shortcuts;
    sorted.sort_by(|a, b| a.display_name.to_lowercase().cmp(&b.display_name.to_lowercase()));

    let icon_cache = app.state::<IconCache>();
    let dtos = sorted
        .into_iter()
        .map(|s| {
            let icon_data_url = icon_cache
                .get_or_extract(&s.target_path)
                .map(|ci| ci.data_url);
            TrayAppDto {
                name: s.name,
                display_name: s.display_name,
                target_path: s.target_path,
                working_directory: s.working_directory,
                icon_data_url,
            }
        })
        .collect();
    Ok(dtos)
}

/// Read pinned + hidden app name lists from config.
fn read_tray_prefs(app: &tauri::AppHandle) -> (HashSet<String>, HashSet<String>) {
    let pinned = read_string_list(app, "tray.pinnedApps");
    let hidden = read_string_list(app, "tray.hiddenApps");
    (pinned, hidden)
}

fn read_string_list(app: &tauri::AppHandle, key: &str) -> HashSet<String> {
    match settings::get_config_value(app.clone(), key.to_string()) {
        Ok(Some(serde_json::Value::Array(arr))) => arr
            .into_iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect(),
        _ => HashSet::new(),
    }
}

/// Show the main window, recreating the webview if it was destroyed on tray-hide.
pub fn show_or_create_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        return;
    }

    match WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
        .title("rscoop")
        .inner_size(800.0, 600.0)
        .build()
    {
        Ok(window) => {
            let _ = window.set_focus();
        }
        Err(e) => log::error!("Failed to recreate main window: {}", e),
    }
}

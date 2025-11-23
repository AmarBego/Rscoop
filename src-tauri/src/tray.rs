use crate::commands::settings;
use crate::state::AppState;
use crate::utils::{get_scoop_app_shortcuts_with_path, launch_scoop_app, ScoopAppShortcut};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

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
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .on_menu_event(move |app, event| {
            let event_id = event.id().as_ref();
            match event_id {
                "quit" => {
                    app.exit(0);
                }
                "show" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "hide" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.hide();
                    }
                }
                "refresh_apps" => {
                    // Refresh the tray menu
                    let app_handle = app.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(e) = refresh_tray_menu(&app_handle).await {
                            log::error!("Failed to refresh tray menu: {}", e);
                        }
                    });
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
        if !shortcuts.is_empty() {
            // Add separator before apps
            let separator = tauri::menu::PredefinedMenuItem::separator(app)?;
            menu_items.push(Box::new(separator));

            // Add "Scoop Apps" label
            let apps_label = tauri::menu::MenuItemBuilder::with_id("apps_label", "Scoop Apps")
                .enabled(false)
                .build(app)?;
            menu_items.push(Box::new(apps_label));

            // Store shortcuts in the map and create menu items
            if let Ok(mut map) = shortcuts_map.lock() {
                map.clear();

                for shortcut in shortcuts {
                    let menu_id = format!("app_{}", shortcut.name);
                    map.insert(menu_id.clone(), shortcut.clone());

                    let menu_item =
                        tauri::menu::MenuItemBuilder::with_id(&menu_id, &shortcut.display_name)
                            .build(app)?;
                    menu_items.push(Box::new(menu_item));
                }
            }
        }
    } else if let Err(e) = shortcuts_result {
        log::warn!("Failed to get Scoop app shortcuts: {}", e);
    }

    // Add separator and refresh option
    let separator = tauri::menu::PredefinedMenuItem::separator(app)?;
    menu_items.push(Box::new(separator));
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

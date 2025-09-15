use crate::commands::powershell::create_powershell_command;
use crate::utils::{get_scoop_app_shortcuts, launch_scoop_app, ScoopAppShortcut};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

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

    // Get Scoop apps shortcuts
    match get_scoop_app_shortcuts() {
        Ok(shortcuts) => {
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
        }
        Err(e) => {
            log::warn!("Failed to get Scoop app shortcuts: {}", e);
        }
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

#[cfg(windows)]
pub async fn show_system_notification(app: &tauri::AppHandle) {
    log::info!("Attempting to show system notification");

    // Try multiple notification methods for better compatibility

    // Method 1: Use Windows 10/11 native toast notifications via PowerShell (without window)
    let toast_command = r#"
try {
    Add-Type -AssemblyName Windows.UI
    Add-Type -AssemblyName Windows.Data
    
    $template = @"
<toast>
    <visual>
        <binding template="ToastText02">
            <text id="1">Rscoop</text>
            <text id="2">Application minimized to system tray. Click the tray icon to restore. You can disable this in settings.</text>
        </binding>
    </visual>
    <actions>
        <action content="Show" arguments="show" />
    </actions>
</toast>
"@
    
    $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
    $xml.LoadXml($template)
    
    $toast = New-Object Windows.UI.Notifications.ToastNotification($xml)
    $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Rscoop")
    $notifier.Show($toast)
    
    Write-Output "Toast notification sent successfully"
} catch {
    Write-Error "Failed to show toast notification: $($_.Exception.Message)"
    exit 1
}
"#;

    let toast_result = create_powershell_command(toast_command).output().await;

    match toast_result {
        Ok(output) => {
            if output.status.success() {
                log::info!("Toast notification sent successfully");
                return;
            } else {
                log::warn!(
                    "Toast notification failed: {}",
                    String::from_utf8_lossy(&output.stderr)
                );
            }
        }
        Err(e) => {
            log::warn!("Failed to execute toast notification command: {}", e);
        }
    }

    // Method 2: Fallback to simple balloon tip using msg command (without window)
    log::info!("Trying fallback notification method");
    let msg_command = r#"msg * "Rscoop minimized to system tray. Click the tray icon to restore. You can disable this in settings.""#;

    let fallback_result = create_powershell_command(msg_command).output().await;

    match fallback_result {
        Ok(output) => {
            if output.status.success() {
                log::info!("Fallback notification sent successfully");
            } else {
                log::warn!(
                    "Fallback notification failed: {}",
                    String::from_utf8_lossy(&output.stderr)
                );
                // Method 3: Use frontend notification as last resort
                show_frontend_notification(app).await;
            }
        }
        Err(e) => {
            log::warn!("Failed to execute fallback notification: {}", e);
            show_frontend_notification(app).await;
        }
    }
}

#[cfg(not(windows))]
pub async fn show_system_notification(app: &tauri::AppHandle) {
    // For non-Windows systems, use frontend notification
    log::info!("Application minimized to system tray. Click the tray icon to restore. You can disable this in settings.");
    show_frontend_notification(app).await;
}

async fn show_frontend_notification(app: &tauri::AppHandle) {
    log::info!("Using frontend notification as fallback");
    if let Err(e) = app.emit("show-tray-notification", ()) {
        log::error!("Failed to emit frontend notification: {}", e);
    }
}

#[tauri::command]
pub async fn show_tray_notification(app: tauri::AppHandle) -> Result<(), String> {
    app.emit("show-tray-notification", ())
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn refresh_tray_apps_menu(app: tauri::AppHandle) -> Result<(), String> {
    refresh_tray_menu(&app).await
}

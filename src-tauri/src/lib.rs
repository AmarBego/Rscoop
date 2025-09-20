// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod cold_start;
mod commands;
mod models;
mod state;
mod tray;
pub mod utils;

use tauri::{Manager, WindowEvent};
use tauri_plugin_log::{Target, TargetKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default().plugin(tauri_plugin_opener::init());

    // Add single instance plugin only on Windows
    #[cfg(windows)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // When a second instance is attempted, show and focus the existing window
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
                let _ = window.unminimize();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_log::Builder::new().build())
        .setup(|app| {
            #[cfg(windows)]
            {
                // Check if installed via Scoop
                let is_scoop = utils::is_scoop_installation();
                log::info!("Application installed via Scoop: {}", is_scoop);

                // Only set up updater if not installed via Scoop
                if !is_scoop {
                    app.handle()
                        .plugin(tauri_plugin_updater::Builder::new().build())
                        .expect("failed to add updater plugin");
                }
            }

            let app_handle = app.handle().clone();
            let scoop_path = match utils::resolve_scoop_root(app_handle) {
                Ok(path) => path,
                Err(e) => {
                    log::warn!("Could not resolve scoop root path: {}", e);
                    // Use a default path or allow user to configure later
                    std::path::PathBuf::from("C:\\scoop")
                }
            };

            let rscoop_state = state::AppState {
                scoop_path,
                installed_packages: tokio::sync::Mutex::new(None),
            };

            app.manage(rscoop_state);

            // Set up system tray
            let _ = tray::setup_system_tray(&app.handle());

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let app_handle = window.app_handle().clone();

                // Check if close to tray is enabled in settings
                let close_to_tray = match commands::settings::get_config_value(
                    app_handle.clone(),
                    "window.closeToTray".to_string(),
                ) {
                    Ok(Some(value)) => value.as_bool().unwrap_or(true), // Default to true
                    _ => true, // Default to true if setting doesn't exist
                };

                if close_to_tray {
                    // Check if first notification has been shown
                    let first_notification_shown = match commands::settings::get_config_value(
                        app_handle.clone(),
                        "window.firstTrayNotificationShown".to_string(),
                    ) {
                        Ok(Some(value)) => value.as_bool().unwrap_or(false),
                        _ => false,
                    };

                    // Hide the window instead of closing the app
                    let _ = window.hide();
                    api.prevent_close();

                    // Show notification if it's the first time
                    if !first_notification_shown {
                        // Mark that we've shown the first notification
                        let _ = commands::settings::set_config_value(
                            app_handle.clone(),
                            "window.firstTrayNotificationShown".to_string(),
                            serde_json::json!(true),
                        );

                        // Show the native dialog on a separate thread to avoid blocking
                        let app_clone = app_handle.clone();
                        std::thread::spawn(move || {
                            tray::show_system_notification_blocking(&app_clone);
                        });
                    }
                } else {
                    // Let the window close normally (exit app)
                    // Don't call prevent_close(), so the app will exit
                }
            }
        })
        .on_page_load(|window, _payload| {
            cold_start::run_cold_start(window.app_handle().clone());
        })
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir { file_name: None }),
                ])
                .level(log::LevelFilter::Trace)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            commands::search::search_scoop,
            commands::installed::get_installed_packages_full,
            commands::installed::refresh_installed_packages,
            commands::installed::get_package_path,
            commands::info::get_package_info,
            commands::install::install_package,
            commands::manifest::get_package_manifest,
            commands::updates::check_for_updates,
            commands::update::update_package,
            commands::update::update_all_packages,
            commands::uninstall::uninstall_package,
            commands::uninstall::clear_package_cache,
            commands::status::check_scoop_status,
            commands::settings::get_config_value,
            commands::settings::set_config_value,
            commands::settings::get_scoop_path,
            commands::settings::set_scoop_path,
            commands::settings::get_virustotal_api_key,
            commands::settings::set_virustotal_api_key,
            commands::virustotal::scan_package,
            commands::doctor::checkup::run_scoop_checkup,
            commands::doctor::cleanup::cleanup_all_apps,
            commands::doctor::cleanup::cleanup_outdated_cache,
            commands::doctor::cache::list_cache_contents,
            commands::doctor::cache::clear_cache,
            commands::doctor::shim::list_shims,
            commands::doctor::shim::remove_shim,
            commands::doctor::shim::alter_shim,
            commands::doctor::shim::add_shim,
            commands::hold::list_held_packages,
            commands::hold::hold_package,
            commands::hold::unhold_package,
            commands::bucket::get_buckets,
            commands::bucket::get_bucket_info,
            commands::bucket::get_bucket_manifests,
            commands::bucket_install::install_bucket,
            commands::bucket_install::validate_bucket_install,
            commands::bucket_install::update_bucket,
            commands::bucket_install::remove_bucket,
            commands::bucket_search::search_buckets,
            commands::bucket_search::get_expanded_search_info,
            commands::bucket_search::get_default_buckets,
            commands::bucket_search::clear_bucket_cache,
            commands::bucket_search::check_bucket_cache_exists,
            commands::app_info::is_scoop_installation,
            tray::refresh_tray_apps_menu
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

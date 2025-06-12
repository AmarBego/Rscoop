use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Runtime};

static COLD_START_DONE: AtomicBool = AtomicBool::new(false);

/// Performs cold start initialization, ensuring it only runs once.
pub fn run_cold_start<R: Runtime>(app: AppHandle<R>) {
    // If already done, just re-emit the success events so late listeners receive them.
    if COLD_START_DONE.swap(true, Ordering::SeqCst) {
        log::info!("Cold start previously completed. Re-emitting ready events.");

        let app_clone = app.clone();
        tauri::async_runtime::spawn(async move {
            // Allow the frontend a moment to register listeners.
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            let _ = app_clone.emit("cold-start-finished", true);
            let _ = app_clone.emit("scoop-ready", true);
        });
        return;
    }

    tauri::async_runtime::spawn(async move {
        log::info!("Prefetching installed packages during cold start...");

        match crate::commands::installed::get_installed_packages_full(app.clone()).await {
            Ok(pkgs) => {
                log::info!("Prefetched {} installed packages", pkgs.len());

                // Warm the search manifest cache.
                if let Err(e) = crate::commands::search::warm_manifest_cache(app.clone()) {
                    log::error!("Failed to warm search manifest cache: {}", e);
                }

                app.emit("cold-start-finished", true).unwrap();
                app.emit("scoop-ready", true).unwrap();
            }
            Err(e) => {
                log::error!("Failed to prefetch installed packages: {}", e);
                // On failure, reset the flag to allow a retry on the next page load.
                COLD_START_DONE.store(false, Ordering::SeqCst);
                app.emit("cold-start-finished", false).unwrap();
                app.emit("scoop-ready", false).unwrap();
            }
        }
    });
}

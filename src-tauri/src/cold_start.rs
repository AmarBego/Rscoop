use crate::state::AppState;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, Runtime};

static COLD_START_DONE: AtomicBool = AtomicBool::new(false);

/// Performs cold start initialization, ensuring it only runs once.
pub fn run_cold_start<R: Runtime>(app: AppHandle<R>) {
    // If already done, just re-emit the success events so late listeners receive them.
    if COLD_START_DONE.swap(true, Ordering::SeqCst) {
        log::info!("Cold start previously completed. Re-emitting ready events.");

        let app_clone = app.clone();
        tauri::async_runtime::spawn(async move {
            // Allow the frontend a moment to register listeners.
            tokio::time::sleep(Duration::from_millis(300)).await;

            // For re-emits, we only need a few attempts
            emit_ready_events_with_retry(&app_clone, true, 2).await;
        });
        return;
    }

    tauri::async_runtime::spawn(async move {
        log::info!("Prefetching installed packages during cold start...");

        let state = app.state::<AppState>();
        match crate::commands::installed::get_installed_packages_full(app.clone(), state).await {
            Ok(pkgs) => {
                log::info!("Prefetched {} installed packages", pkgs.len());

                // Warm the search manifest cache.
                if let Err(e) = crate::commands::search::warm_manifest_cache(app.clone()).await {
                    log::error!("Failed to warm search manifest cache: {}", e);
                }

                // Emit events with retry logic
                emit_ready_events_with_retry(&app, true, 3).await;
            }
            Err(e) => {
                log::error!("Failed to prefetch installed packages: {}", e);
                // On failure, reset the flag to allow a retry on the next page load.
                COLD_START_DONE.store(false, Ordering::SeqCst);

                // Emit failure events
                emit_ready_events_with_retry(&app, false, 3).await;
            }
        }
    });
}

/// Emits ready events with exponential backoff retry logic to ensure delivery
async fn emit_ready_events_with_retry<R: Runtime>(app: &AppHandle<R>, success: bool, max_retries: u32) {
    let mut retry_count = 0;

    while retry_count < max_retries {
        let delay = if retry_count == 0 {
            Duration::from_millis(50)
        } else {
            // Exponential backoff: 150ms, 450ms
            Duration::from_millis(150 * 3u64.pow(retry_count as u32 - 1))
        };

        log::info!(
            "Emitting cold start events (attempt {}/{})",
            retry_count + 1,
            max_retries
        );

        // Emit events globally. Tauri Emitter::emit is reliable and reaches all windows.
        // We emit both for compatibility, but the frontend should ideally listen to just one.
        if let Err(e) = app.emit("cold-start-finished", success) {
            log::error!("Failed to emit cold-start-finished globally: {}", e);
        }

        if let Err(e) = app.emit("scoop-ready", success) {
            log::error!("Failed to emit scoop-ready globally: {}", e);
        }

        // If we're on the last retry, log a warning
        if retry_count == max_retries - 1 {
            log::debug!("Completed emission attempts for cold start events");
        }

        tokio::time::sleep(delay).await;
        retry_count += 1;
    }
}

/// Returns whether the cold start sequence has completed successfully.
#[tauri::command]
pub fn is_cold_start_ready() -> bool {
    COLD_START_DONE.load(Ordering::SeqCst)
}

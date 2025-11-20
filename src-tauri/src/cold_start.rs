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
            tokio::time::sleep(Duration::from_millis(500)).await;

            // Emit events with exponential backoff to ensure delivery
            emit_ready_events_with_retry(&app_clone, true).await;
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
                emit_ready_events_with_retry(&app, true).await;
            }
            Err(e) => {
                log::error!("Failed to prefetch installed packages: {}", e);
                // On failure, reset the flag to allow a retry on the next page load.
                COLD_START_DONE.store(false, Ordering::SeqCst);

                // Emit failure events
                if let Err(err) = app.emit("cold-start-finished", false) {
                    log::error!("Failed to emit cold-start-finished failure event: {}", err);
                }
                if let Err(err) = app.emit("scoop-ready", false) {
                    log::error!("Failed to emit scoop-ready failure event: {}", err);
                }
            }
        }
    });
}

/// Emits ready events with exponential backoff retry logic to ensure delivery
async fn emit_ready_events_with_retry<R: Runtime>(app: &AppHandle<R>, success: bool) {
    let mut retry_count = 0;
    let max_retries = 5;

    while retry_count < max_retries {
        let delay = if retry_count == 0 {
            Duration::from_millis(100)
        } else {
            // Exponential backoff: 200ms, 400ms, 800ms, 1600ms
            Duration::from_millis(200 * 2u64.pow(retry_count as u32 - 1))
        };

        log::info!(
            "Emitting cold start events (attempt {}/{})",
            retry_count + 1,
            max_retries
        );

        // Try to emit to main window specifically first
        let main_result = app.emit_to("main", "cold-start-finished", success);
        if let Err(e) = &main_result {
            log::warn!("Failed to emit cold-start-finished to main window: {}", e);
        }

        // Fallback to global emit if targeting fails
        if main_result.is_err() {
            if let Err(e) = app.emit("cold-start-finished", success) {
                log::error!("Failed to emit cold-start-finished globally: {}", e);
            }
        }

        // Same for scoop-ready event
        let scoop_ready_result = app.emit_to("main", "scoop-ready", success);
        if let Err(e) = &scoop_ready_result {
            log::warn!("Failed to emit scoop-ready to main window: {}", e);
        }

        if scoop_ready_result.is_err() {
            if let Err(e) = app.emit("scoop-ready", success) {
                log::error!("Failed to emit scoop-ready globally: {}", e);
            }
        }

        // If we're on the last retry, log a warning
        if retry_count == max_retries - 1 {
            log::warn!("Final attempt to emit cold start events completed");
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

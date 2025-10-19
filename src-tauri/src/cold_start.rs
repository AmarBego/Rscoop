use crate::state::AppState;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, Runtime};

static COLD_START_DONE: AtomicBool = AtomicBool::new(false);

/// Performs cold start initialization, ensuring it only runs once.
pub fn run_cold_start<R: Runtime>(app: AppHandle<R>) {
    // If already done, just re-emit the success events so late listeners receive them.
    if COLD_START_DONE.swap(true, Ordering::SeqCst) {
        log::debug!(
            "=== COLD START TRACE === Cold start previously completed. Re-emitting ready events (late listener)."
        );

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
        log::info!("=== COLD START TRACE === [1/6] Starting cold start initialization");

        let state = app.state::<AppState>();

        // Step 1: Log current path
        let current_scoop_path = state.scoop_path();
        log::info!(
            "=== COLD START TRACE === [2/6] Current Scoop path: {}",
            current_scoop_path.display()
        );

        // Step 2: Re-resolve the Scoop root now that the application is fully initialized.
        // This helps recover from scenarios where the initial detection (during setup)
        // ran under elevated privileges and could not see the user's Scoop directory.
        log::info!("=== COLD START TRACE === [3/6] Attempting to re-detect Scoop root...");
        match crate::utils::resolve_scoop_root(app.clone()) {
            Ok(resolved_path) => {
                if resolved_path != current_scoop_path {
                    log::info!(
                        "=== COLD START TRACE === [3/6] ✓ Updated Scoop root from '{}' to '{}'",
                        current_scoop_path.display(),
                        resolved_path.display()
                    );
                    state.set_scoop_path(resolved_path);

                    // Clear any cached installed-package data associated with the old path.
                    let mut cache_guard = state.installed_packages.lock().await;
                    *cache_guard = None;
                    log::info!("=== COLD START TRACE === [3/6] Cache cleared due to path change");
                } else {
                    log::info!(
                        "=== COLD START TRACE === [3/6] Path unchanged: {}",
                        resolved_path.display()
                    );
                }
            }
            Err(e) => {
                log::warn!(
                    "=== COLD START TRACE === [3/6] ✗ Path re-detection failed: {}",
                    e
                );
            }
        }

        let app_for_installed = app.clone();
        let app_for_warm = app.clone();

        log::info!("=== COLD START TRACE === [4/6] Starting parallel prefetch tasks (installed packages + warm cache)");

        let (installed_result, warm_result) = tokio::join!(
            crate::commands::installed::warmup_installed_packages(app_for_installed, state),
            crate::commands::search::warm_manifest_cache(app_for_warm)
        );

        if let Err(e) = warm_result {
            log::error!(
                "=== COLD START TRACE === [4/6] ✗ Failed to warm search manifest cache: {}",
                e
            );
        } else {
            log::info!("=== COLD START TRACE === [4/6] ✓ Manifest cache warmed successfully");
        }

        match installed_result {
            Ok(pkgs) => {
                log::info!(
                    "=== COLD START TRACE === [4/6] ✓ Prefetched {} installed packages",
                    pkgs.len()
                );
                log::info!(
                    "=== COLD START TRACE === [5/6] Emitting success events with retry logic"
                );
                // Emit events with retry logic
                emit_ready_events_with_retry(&app, true).await;
                log::info!("=== COLD START TRACE === [6/6] ✓ Cold start completed successfully");
            }
            Err(e) => {
                log::error!(
                    "=== COLD START TRACE === [4/6] ✗ Failed to prefetch installed packages: {}",
                    e
                );
                // On failure, reset the flag to allow a retry on the next page load.
                COLD_START_DONE.store(false, Ordering::SeqCst);

                // Emit failure events
                if let Err(err) = app.emit("cold-start-finished", false) {
                    log::error!("=== COLD START TRACE === [5/6] ✗ Failed to emit cold-start-finished failure event: {}", err);
                }
                if let Err(err) = app.emit("scoop-ready", false) {
                    log::error!("=== COLD START TRACE === [5/6] ✗ Failed to emit scoop-ready failure event: {}", err);
                }
                log::info!(
                    "=== COLD START TRACE === [6/6] ✗ Cold start failed, flag reset for retry"
                );
            }
        }
    });
}

/// Emits ready events with exponential backoff retry logic to ensure delivery
/// Breaks out early once all events emit successfully to reduce log noise
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

        if retry_count > 0 {
            log::debug!(
                "=== COLD START TRACE === Retrying event emission (attempt {}/{})",
                retry_count + 1,
                max_retries
            );
        }

        // Try to emit to main window specifically first
        let main_finished = app.emit_to("main", "cold-start-finished", success).is_ok();
        let fallback_finished = if !main_finished {
            app.emit("cold-start-finished", success).is_ok()
        } else {
            true
        };

        // Same for scoop-ready event
        let main_ready = app.emit_to("main", "scoop-ready", success).is_ok();
        let fallback_ready = if !main_ready {
            app.emit("scoop-ready", success).is_ok()
        } else {
            true
        };

        // Check if all emissions succeeded
        let cold_start_ok = main_finished || fallback_finished;
        let scoop_ready_ok = main_ready || fallback_ready;

        if cold_start_ok && scoop_ready_ok {
            log::info!(
                "=== COLD START TRACE === ✓ All ready events emitted successfully (attempt {}/{})",
                retry_count + 1,
                max_retries
            );
            return; // Break out early - success!
        }

        // Only log warnings if we're going to retry
        if !cold_start_ok {
            log::warn!(
                "=== COLD START TRACE === Failed to emit cold-start-finished (attempt {}/{})",
                retry_count + 1,
                max_retries
            );
        }
        if !scoop_ready_ok {
            log::warn!(
                "=== COLD START TRACE === Failed to emit scoop-ready (attempt {}/{})",
                retry_count + 1,
                max_retries
            );
        }

        tokio::time::sleep(delay).await;
        retry_count += 1;
    }

    // Only log warning if we exhausted all retries
    log::warn!(
        "=== COLD START TRACE === Failed to emit ready events after {} attempts",
        max_retries
    );
}

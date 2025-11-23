use tauri::{AppHandle, Emitter, Manager};
use crate::commands;
use crate::state;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

pub fn start_background_tasks(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        // Helper to parse interval string into seconds
        let parse_interval = |val: &str| -> Option<u64> {
            match val {
                "24h" | "1d" => Some(86400),
                "7d" | "1w" => Some(604800),
                "1h" => Some(3600),
                "6h" => Some(21600),
                off if off == "off" => None,
                custom if custom.starts_with("custom:") => custom[7..].parse::<u64>().ok(),
                numeric => numeric.parse::<u64>().ok(),
            }
        };

        loop {
            // Read interval each loop so changes apply promptly
            let interval_raw = commands::settings::get_config_value(
                app.clone(),
                "buckets.autoUpdateInterval".to_string(),
            )
            .ok()
            .flatten()
            .and_then(|v| v.as_str().map(|s| s.to_string()))
            .unwrap_or_else(|| "off".to_string());

            let interval_secs_opt = parse_interval(&interval_raw);
            if interval_secs_opt.is_none() {
                // Off: poll more frequently for changes
                log::trace!("[scheduler] interval='off' polling again in 30s");
                tokio::time::sleep(Duration::from_secs(30)).await;
                continue;
            }
            let interval_secs = interval_secs_opt.unwrap();

            // Load last run timestamp
            let last_ts_val = commands::settings::get_config_value(
                app.clone(),
                "buckets.lastAutoUpdateTs".to_string(),
            )
            .ok()
            .flatten();
            let last_ts = last_ts_val
                .and_then(|v| v.as_u64())
                .unwrap_or(0u64);

            let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
            let elapsed = if last_ts == 0 { interval_secs } else { now.saturating_sub(last_ts) };

            if last_ts == 0 {
                log::trace!("[scheduler] no previous run recorded; treating as overdue");
            }

            if elapsed >= interval_secs {
                log::info!("Auto bucket update task running (interval='{}', seconds={}, elapsed={})", interval_raw, interval_secs, elapsed);
                let run_started_at = now;
                
                // Emit start event to show modal
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("auto-operation-start", "Updating buckets...");
                    let _ = window.emit("operation-output", serde_json::json!({
                        "line": "Starting automatic bucket update...",
                        "source": "stdout"
                    }));
                }
                
                match commands::bucket_install::update_all_buckets().await {
                    Ok(results) => {
                        let successes = results.iter().filter(|r| r.success).count();
                        log::info!(
                            "Auto bucket update completed: {} successes / {} total",
                            successes,
                            results.len()
                        );
                        
                        // Stream results to modal
                        if let Some(window) = app.get_webview_window("main") {
                            for result in &results {
                                let line = if result.success {
                                    format!("✓ Updated bucket: {}", result.bucket_name)
                                } else {
                                    format!("✗ Failed to update {}: {}", result.bucket_name, result.message)
                                };
                                let _ = window.emit("operation-output", serde_json::json!({
                                    "line": line,
                                    "source": if result.success { "stdout" } else { "stderr" }
                                }));
                            }
                            let _ = window.emit("operation-finished", serde_json::json!({
                                "success": successes == results.len(),
                                "message": format!("Bucket update completed: {} of {} succeeded", successes, results.len())
                            }));
                        }
                        
                        // Persist last run timestamp (record even if partial successes to avoid hammering)
                        let _ = commands::settings::set_config_value(
                            app.clone(),
                            "buckets.lastAutoUpdateTs".to_string(),
                            serde_json::json!(run_started_at),
                        );

                        // After buckets update, optionally run package updates
                        let auto_update_packages = commands::settings::get_config_value(
                            app.clone(),
                            "buckets.autoUpdatePackagesEnabled".to_string(),
                        )
                        .ok()
                        .flatten()
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);

                        if auto_update_packages {
                            log::info!("Auto package update task running after bucket refresh (headless with events)");
                            let state = app.state::<state::AppState>();
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.emit("auto-operation-start", "Updating packages...");
                                let _ = window.emit("operation-output", serde_json::json!({
                                    "line": "Starting automatic package update...",
                                    "source": "stdout"
                                }));
                            }
                            match commands::update::update_all_packages_headless(app.clone(), state).await {
                                Ok(_) => {
                                    if let Some(window) = app.get_webview_window("main") {
                                        let _ = window.emit("operation-output", serde_json::json!({
                                            "line": "Package update completed successfully.",
                                            "source": "stdout"
                                        }));
                                        let _ = window.emit("operation-finished", serde_json::json!({
                                            "success": true,
                                            "message": "Automatic package update completed successfully"
                                        }));
                                    }
                                }
                                Err(e) => {
                                    log::warn!("Auto package headless update failed: {}", e);
                                    if let Some(window) = app.get_webview_window("main") {
                                        let _ = window.emit("operation-output", serde_json::json!({
                                            "line": format!("Error: {}", e),
                                            "source": "stderr"
                                        }));
                                        let _ = window.emit("operation-finished", serde_json::json!({
                                            "success": false,
                                            "message": format!("Automatic package update failed: {}", e)
                                        }));
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        log::warn!("Auto bucket update failed: {}", e);
                        
                        // Emit failure to modal
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.emit("operation-output", serde_json::json!({
                                "line": format!("Error: {}", e),
                                "source": "stderr"
                            }));
                            let _ = window.emit("operation-finished", serde_json::json!({
                                "success": false,
                                "message": format!("Bucket update failed: {}", e)
                            }));
                        }
                        
                        // Even on failure, set timestamp to avoid rapid retry storms
                        let _ = commands::settings::set_config_value(
                            app.clone(),
                            "buckets.lastAutoUpdateTs".to_string(),
                            serde_json::json!(run_started_at),
                        );
                    }
                }
                // Loop again immediately to compute next run
                continue;
            }

            // Not yet due: sleep in chunks until due or interval changes
            let remaining = interval_secs - elapsed; // > 0 here
            let chunk = if remaining <= 60 { remaining } else { 60 }; // Max 60s granularity
            let next_run_at = now + remaining;
            log::trace!(
                "[scheduler] next run due in {}s (at {}), interval='{}', remaining chunk={}s",
                remaining, next_run_at, interval_raw, chunk
            );
            tokio::time::sleep(Duration::from_secs(chunk)).await;
            // After sleep, loop re-evaluates (interval or last_ts may have changed)
        }
    });
}

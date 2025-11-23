use crate::state::AppState;
use chrono::Local;
use std::fs;
use std::path::PathBuf;
use tauri::State;

/// Retrieves all relevant debug information for troubleshooting cold-start issues
#[tauri::command]
pub async fn get_debug_info(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let scoop_path = state.scoop_path();
    let apps_path = scoop_path.join("apps");

    log::info!("=== DEBUG INFO === get_debug_info called");

    // Try to read apps directory
    let app_count = if apps_path.is_dir() {
        fs::read_dir(&apps_path)
            .map(|entries| entries.count())
            .unwrap_or(0)
    } else {
        0
    };

    log::info!("=== DEBUG INFO === App count from disk: {}", app_count);

    // Check if apps directory exists
    let apps_dir_exists = apps_path.is_dir();

    // Check cache state
    let cache_guard = state.installed_packages.lock().await;
    let cache_info = if let Some(cache) = cache_guard.as_ref() {
        log::info!(
            "=== DEBUG INFO === Cache found with {} packages, fingerprint: {}",
            cache.packages.len(),
            cache.fingerprint
        );
        serde_json::json!({
            "cached_count": cache.packages.len(),
            "fingerprint": cache.fingerprint,
        })
    } else {
        log::info!("=== DEBUG INFO === No cache found (None)");
        serde_json::json!({
            "cached_count": 0,
            "fingerprint": null,
        })
    };
    drop(cache_guard); // Explicitly drop guard

    let debug_result = serde_json::json!({
        "timestamp": Local::now().to_rfc3339(),
        "scoop_path": scoop_path.display().to_string(),
        "apps_dir_exists": apps_dir_exists,
        "app_count": app_count,
        "cache_info": cache_info,
    });

    log::info!(
        "=== DEBUG INFO === Returning debug info: cached_count={}, app_count={}",
        debug_result["cache_info"]["cached_count"],
        app_count
    );

    Ok(debug_result)
}
/// Gets the current application logs from the logging system
#[tauri::command]
pub fn get_app_logs() -> Result<String, String> {
    let mut log_info = String::new();

    log_info.push_str("=== LOGGING INFORMATION ===\n\n");
    log_info.push_str("Current Logging Configuration:\n");
    log_info.push_str("- Logs are written to: disk files + stdout (terminal window)\n");
    log_info.push_str("- Log level: TRACE\n");
    log_info.push_str("- Log format: timestamp, level, target, message\n\n");

    log_info.push_str("Log File Locations:\n");

    if let Some(log_path) = get_log_dir() {
        if log_path.is_dir() {
            log_info.push_str(&format!("✓ Log directory: {}\n", log_path.display()));

            if let Ok(entries) = fs::read_dir(&log_path) {
                let mut log_files: Vec<PathBuf> = entries
                    .filter_map(|entry| {
                        entry.ok().and_then(|e| {
                            let path = e.path();
                            if path.is_file() && path.extension().map_or(false, |ext| ext == "log")
                            {
                                Some(path)
                            } else {
                                None
                            }
                        })
                    })
                    .collect();

                // Sort by modification time, newest first
                log_files.sort_by_key(|path| {
                    fs::metadata(path)
                        .and_then(|meta| meta.modified())
                        .unwrap_or(std::time::SystemTime::UNIX_EPOCH)
                });
                log_files.reverse();

                if !log_files.is_empty() {
                    log_info.push_str("  Recent log files:\n");
                    for (i, path) in log_files.iter().take(5).enumerate() {
                        if let Ok(metadata) = fs::metadata(&path) {
                            let size = metadata.len();
                            log_info.push_str(&format!(
                                "  {}. {} ({} bytes)\n",
                                i + 1,
                                path.display(),
                                size
                            ));
                        }
                    }
                }
            }
        } else {
            log_info.push_str("  Logs not yet created (will be created on first run)\n");
            log_info.push_str(&format!("  Expected location: {}\n", log_path.display()));
        }
    } else {
        log_info.push_str("  Could not determine log directory location.\n");
    }

    log_info.push_str("\nTo View Logs:\n");
    log_info.push_str("1. Development Mode:\n");
    log_info.push_str("   $ npm run tauri dev\n");
    log_info.push_str("   - Logs appear in terminal AND are written to disk\n");
    log_info
        .push_str("   - Look for messages: '=== COLD START TRACE ===', '=== DEBUG INFO ==='\n\n");

    log_info.push_str("2. Production Build:\n");
    log_info.push_str("   - Logs are automatically written to disk\n");
    log_info.push_str("   - Check the log files in %LOCALAPPDATA%\\rscoop\\logs\\\n");
    log_info.push_str("   - Open in any text editor\n\n");

    log_info.push_str("3. Frontend Logs (Browser Console):\n");
    log_info.push_str("   - Press F12 to open Developer Tools\n");
    log_info.push_str("   - Check the Console tab for frontend errors and messages\n\n");

    log_info.push_str("Key Log Markers:\n");
    log_info
        .push_str("- Cold start: '=== COLD START TRACE ===' markers with [1/6] through [6/6]\n");
    log_info.push_str("- Debug info: '=== DEBUG INFO ===' markers\n");
    log_info.push_str("- Scoop operations: general backend operations\n");

    Ok(log_info)
}

/// Reads the current application log file
#[tauri::command]
pub fn read_app_log_file() -> Result<String, String> {
    // Determine log file path - use LOCALAPPDATA\rscoop\logs\rscoop.log on Windows
    let log_file = if let Some(local_data) = dirs::data_local_dir() {
        local_data.join("rscoop").join("logs").join("rscoop.log")
    } else {
        PathBuf::from("./logs/rscoop.log")
    };

    // Read the log file
    match fs::read_to_string(&log_file) {
        Ok(content) => Ok(content),
        Err(e) => {
            if !log_file.exists() {
                Ok(format!(
                    "Log file not found at: {}\n\nLogs will be created after the first run.",
                    log_file.display()
                ))
            } else {
                Err(format!("Failed to read log file: {}", e))
            }
        }
    }
}

fn get_log_dir() -> Option<PathBuf> {
    dirs::data_local_dir().map(|d| d.join("rscoop").join("logs"))
}

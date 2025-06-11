//! Commands for cleaning up Scoop apps and cache.
use crate::commands::powershell;
use tauri::Window;

/// Runs a specific Scoop cleanup command and streams its output.
///
/// # Arguments
/// * `window` - The Tauri window to emit events to.
/// * `command` - The full `scoop cleanup` command to execute.
/// * `operation_name` - A descriptive name for the operation being performed.
async fn run_cleanup_command(
    window: Window,
    command: &str,
    operation_name: &str,
) -> Result<(), String> {
    powershell::run_and_stream_command(
        window,
        command.to_string(),
        operation_name.to_string(),
        powershell::EVENT_OUTPUT,
        powershell::EVENT_FINISHED,
        powershell::EVENT_CANCEL,
    )
    .await
}

/// Cleans up old versions of all installed apps.
#[tauri::command]
pub async fn cleanup_all_apps(window: Window) -> Result<(), String> {
    log::info!("Running 'scoop cleanup --all'");
    run_cleanup_command(
        window,
        "scoop cleanup --all",
        "Cleanup Old App Versions",
    )
    .await
}

/// Cleans up the download cache for all apps.
#[tauri::command]
pub async fn cleanup_outdated_cache(window: Window) -> Result<(), String> {
    log::info!("Running 'scoop cleanup --all --cache'");
    run_cleanup_command(
        window,
        "scoop cleanup --all --cache",
        "Cleanup Outdated App Caches",
    )
    .await
}
 
use tauri::Window;
use crate::commands::powershell;

#[tauri::command]
pub async fn cleanup_all_apps(window: Window) -> Result<(), String> {
    let command_str = "scoop cleanup --all".to_string();
    let operation_name = "Cleanup Old App Versions".to_string();
    powershell::run_and_stream_command(
        window,
        command_str,
        operation_name,
        "operation-output",
        "operation-finished",
        "cancel-operation",
    )
    .await
}

#[tauri::command]
pub async fn cleanup_outdated_cache(window: Window) -> Result<(), String> {
    let command_str = "scoop cleanup --all --cache".to_string();
    let operation_name = "Cleanup Outdated App Caches".to_string();
    powershell::run_and_stream_command(
        window,
        command_str,
        operation_name,
        "operation-output",
        "operation-finished",
        "cancel-operation",
    )
    .await
} 
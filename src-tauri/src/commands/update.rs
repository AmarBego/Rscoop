use tauri::Window;
use crate::commands::powershell;

#[tauri::command]
pub async fn update_package(window: Window, package_name: String) -> Result<(), String> {
    let command_str = format!("scoop update {}", package_name);
    let operation_name = format!("Updating package: {}", package_name);
    powershell::run_and_stream_command(window, command_str, operation_name, "operation-output", "operation-finished", "cancel-operation").await
}

#[tauri::command]
pub async fn update_all_packages(window: Window) -> Result<(), String> {
    let command_str = "scoop update *".to_string();
    let operation_name = "Updating all packages".to_string();
    powershell::run_and_stream_command(window, command_str, operation_name, "operation-output", "operation-finished", "cancel-operation").await
} 
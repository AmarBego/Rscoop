use tauri::Window;
use crate::commands::powershell;

#[tauri::command]
pub async fn uninstall_package(
    window: Window,
    package_name: String,
    package_source: String,
) -> Result<(), String> {
    let command_str = if !package_source.is_empty() && package_source != "None" {
        format!("scoop uninstall {}/{}", package_source, package_name)
    } else {
        format!("scoop uninstall {}", package_name)
    };

    let operation_name = format!("Uninstall of {}", package_name);

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
pub async fn clear_package_cache(
    window: Window,
    package_name: String,
    package_source: String,
) -> Result<(), String> {
    let command_str = if !package_source.is_empty() && package_source != "None" {
        format!("scoop cache rm {}", package_name)
    } else {
        format!("scoop cache rm {}", package_name)
    };

    let operation_name = format!("Clearing cache for {}", package_name);

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
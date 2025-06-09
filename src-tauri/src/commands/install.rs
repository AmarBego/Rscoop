use tauri::Window;
use crate::commands::powershell;

#[tauri::command]
pub async fn install_package(
    window: Window,
    package_name: String,
    package_source: String,
) -> Result<(), String> {
    log::info!(
        "Attempting to install package: '{}' from bucket: '{}'",
        package_name,
        package_source
    );

    let command_str = if !package_source.is_empty() && package_source != "None" {
        format!("scoop install {}/{}", package_source, package_name)
    } else {
        format!("scoop install {}", package_name)
    };
    
    let operation_name = format!("Installation of {}", package_name);

    powershell::run_and_stream_command(
        window,
        command_str,
        operation_name,
        "operation-output",
        "operation-finished",
        "cancel-operation"
    ).await
} 
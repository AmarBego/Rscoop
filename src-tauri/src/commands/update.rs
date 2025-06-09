use serde::{Deserialize, Serialize};
use tauri::{Emitter, Window};
use crate::commands::powershell;

// Structs for sfsu status --json output
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct UpdatablePackage {
    name: String,
    current: String,
    available: String,
}

#[derive(Deserialize, Debug)]
struct SfsuStatus {
    packages: Vec<UpdatablePackage>,
}

#[tauri::command]
pub async fn check_for_updates() -> Result<Vec<UpdatablePackage>, String> {
    log::info!("Executing command: sfsu status --json");
    let output = powershell::execute_command("sfsu status --json")
        .await
        .map_err(|e| format!("Failed to execute sfsu status: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("sfsu status command failed: {}", stderr));
    }

    let status: SfsuStatus = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse sfsu status JSON: {}", e))?;

    log::info!("Found {} updatable packages", status.packages.len());
    Ok(status.packages)
}

#[tauri::command]
pub async fn update_package(window: Window, package_name: String) -> Result<(), String> {
    let command_str = format!("scoop update {}", package_name);
    let operation_name = format!("Update for {}", package_name);
    powershell::run_and_stream_command(
        window,
        command_str,
        operation_name,
        "operation-output",
        "operation-finished",
        "cancel-operation"
    ).await
}

#[tauri::command]
pub async fn update_all_packages(window: Window, ignored_packages: Vec<String>) -> Result<(), String> {
    let all_updatable = check_for_updates().await?;
    
    let packages_to_update: Vec<String> = all_updatable
        .into_iter()
        .filter(|p| !ignored_packages.contains(&p.name))
        .map(|p| p.name)
        .collect();

    if packages_to_update.is_empty() {
        log::info!("No packages to update after filtering.");
        let _ = window.emit("operation-finished", powershell::CommandResult { success: true, message: "No packages to update.".to_string() });
        return Ok(());
    }

    let command_str = format!("scoop update {}", packages_to_update.join(" "));
    powershell::run_and_stream_command(
        window,
        command_str,
        "Update All".to_string(),
        "operation-output",
        "operation-finished",
        "cancel-operation"
    ).await
} 
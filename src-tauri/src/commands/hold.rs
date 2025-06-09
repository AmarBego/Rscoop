use serde::Deserialize;
use tauri::Window;
use crate::commands::powershell;

// Structure to deserialize the output from `sfsu list --json`
#[derive(Deserialize, Debug)]
struct SfsuPackage {
    name: String,
    notes: Option<String>,
}

#[tauri::command]
pub async fn list_held_packages() -> Result<Vec<String>, String> {
    log::info!("Listing held packages using `sfsu list --json`");

    let output = powershell::execute_command("sfsu list --json")
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        log::error!("`sfsu list --json` command failed: {}", stderr);
        return Err(format!("Failed to list packages: {}", stderr));
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    if stdout.trim().is_empty() {
        return Ok(vec![]);
    }
    
    let all_packages: Vec<SfsuPackage> = serde_json::from_str(&stdout)
        .map_err(|e| {
            log::error!("Failed to parse sfsu list JSON: {}", e);
            format!("Could not parse package data from sfsu: {}", e)
        })?;
    
    // Filter for packages where the notes indicate it's held.
    let held_packages: Vec<String> = all_packages
        .into_iter()
        .filter(|p| p.notes.as_deref() == Some("Held package"))
        .map(|p| p.name)
        .collect();
    
    log::info!("Found {} held packages", held_packages.len());
    Ok(held_packages)
}

#[tauri::command]
pub async fn hold_package(window: Window, package_name: String) -> Result<(), String> {
    let command_str = format!("scoop hold {}", package_name);
    let operation_name = format!("Placing a hold on: {}", package_name);
    powershell::run_and_stream_command(window, command_str, operation_name, "operation-output", "operation-finished", "cancel-operation").await
}

#[tauri::command]
pub async fn unhold_package(window: Window, package_name: String) -> Result<(), String> {
    let command_str = format!("scoop unhold {}", package_name);
    let operation_name = format!("Removing hold from: {}", package_name);
    powershell::run_and_stream_command(window, command_str, operation_name, "operation-output", "operation-finished", "cancel-operation").await
} 
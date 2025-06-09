use serde::{Deserialize, Serialize};
use tauri::Window;
use crate::commands::powershell;

// Represents the data structure from the PowerShell `ConvertTo-Json` output.
#[derive(Deserialize, Debug)]
#[serde(rename_all = "PascalCase")]
struct PowerShellCacheEntry {
    name: String,
    version: String,
    length: u64,
}

// Represents the data structure we send to the frontend (camelCase).
#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CacheEntry {
    pub name: String,
    pub version: String,
    pub length: u64,
}

#[tauri::command]
pub async fn list_cache_contents() -> Result<Vec<CacheEntry>, String> {
    log::info!("Listing cache contents with `scoop cache | ConvertTo-Json`");

    let command_str = "scoop cache | ConvertTo-Json";
    let output = powershell::execute_command(command_str)
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        log::error!("`scoop cache` command failed: {}", stderr);
        return Err(format!("Failed to list cache contents: {}", stderr));
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);

    let json_start = stdout.find(|c| c == '{' || c == '[').unwrap_or(0);
    let json_str = &stdout[json_start..];

    let parsed_entries: Vec<PowerShellCacheEntry> = if json_str.trim().starts_with('{') {
        let entry: PowerShellCacheEntry = serde_json::from_str(json_str)
            .map_err(|e| format!("Failed to parse single cache entry: {}. Raw: {}", e, json_str))?;
        vec![entry]
    } else {
        serde_json::from_str(json_str).map_err(|e| {
            log::error!("Failed to parse scoop cache JSON array: {}. Output: {}", e, json_str);
            format!("Failed to parse cache data from `scoop`: {}", e)
        })?
    };

    // Map from the PowerShell format to the frontend format.
    let frontend_entries = parsed_entries.into_iter().map(|entry| CacheEntry {
        name: entry.name,
        version: entry.version,
        length: entry.length,
    }).collect();

    Ok(frontend_entries)
}

#[tauri::command]
pub async fn clear_cache(window: Window, packages: Vec<String>) -> Result<(), String> {
    let command_args = if packages.is_empty() {
        // Using --all to clear everything
        "--all".to_string()
    } else {
        packages.join(" ")
    };

    let command_str = format!("scoop cache rm {}", command_args);
    let operation_name = if packages.is_empty() {
        "Clearing all package caches".to_string()
    } else {
        format!("Clearing cache for {} package(s)", packages.len())
    };

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
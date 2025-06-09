use serde::{Deserialize, Serialize};
use tauri::Window;
use crate::commands::powershell;

// For deserializing the `PascalCase` output from PowerShell.
#[derive(Deserialize, Debug)]
#[serde(rename_all = "PascalCase")]
struct PowerShellShim {
    name: String,
    path: String,
    source: String,
    #[serde(rename = "Type")]
    shim_type: String,
    is_global: bool,
    is_hidden: bool,
}

// For serializing `camelCase` data to the frontend.
#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Shim {
    name: String,
    path: String,
    source: String,
    shim_type: String,
    is_global: bool,
    is_hidden: bool,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AddShimArgs {
    name: String,
    path: String,
    args: Option<String>,
    global: bool,
}

#[tauri::command]
pub async fn list_shims() -> Result<Vec<Shim>, String> {
    log::info!("Listing shims with `scoop shim list | ConvertTo-Json`");

    let output = powershell::execute_command("scoop shim list | ConvertTo-Json")
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        log::error!("`scoop shim list` command failed: {}", stderr);
        return Err(format!("Failed to list shims: {}", stderr));
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let json_start = stdout.find('[').unwrap_or(0);
    let json_str = &stdout[json_start..];
    
    let parsed_shims: Vec<PowerShellShim> = serde_json::from_str(json_str)
        .map_err(|e| {
            log::error!("Failed to parse shim list JSON: {}", e);
            format!("Could not parse shim data: {}", e)
        })?;

    let frontend_shims = parsed_shims.into_iter().map(|s| Shim {
        name: s.name,
        path: s.path,
        source: s.source,
        shim_type: s.shim_type,
        is_global: s.is_global,
        is_hidden: s.is_hidden,
    }).collect();
    
    Ok(frontend_shims)
}

#[tauri::command]
pub async fn alter_shim(window: Window, shim_name: String) -> Result<(), String> {
    let command_str = format!("scoop shim alter {}", shim_name);
    let operation_name = format!("Altering shim: {}", shim_name);

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
pub async fn remove_shim(window: Window, shim_name: String) -> Result<(), String> {
    let command_str = format!("scoop shim rm {}", shim_name);
    let operation_name = format!("Removing shim: {}", shim_name);

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
pub async fn add_shim(window: Window, args: AddShimArgs) -> Result<(), String> {
    let mut command = String::from("scoop shim add");

    if args.global {
        command.push_str(" --global");
    }

    // Wrap name and path in quotes to handle spaces
    command.push_str(&format!(" \"{}\" \"{}\"", args.name, args.path));

    if let Some(shim_args) = args.args {
        if !shim_args.is_empty() {
            command.push_str(&format!(" -- {}", shim_args));
        }
    }
    
    log::info!("Executing add shim command: {}", command);

    let operation_name = format!("Adding shim: {}", args.name);

    powershell::run_and_stream_command(
        window,
        command,
        operation_name,
        "operation-output",
        "operation-finished",
        "cancel-operation",
    )
    .await
} 
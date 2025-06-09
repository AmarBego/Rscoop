use serde::Serialize;
use tauri::{Emitter, Window};
use tokio::io::{AsyncBufReadExt, BufReader};
use crate::commands::powershell;

#[derive(Serialize, Clone, Debug)]
pub struct VirustotalResult {
    detections_found: bool,
    is_api_key_missing: bool,
    message: String,
}

#[tauri::command]
pub async fn scan_package(
    window: Window,
    package_name: String,
    package_source: String,
) -> Result<(), String> {
    let command_str = if !package_source.is_empty() && package_source != "None" {
        format!("scoop virustotal {}/{}", package_source, package_name)
    } else {
        format!("scoop virustotal {}", package_name)
    };

    log::info!("Executing command: {}", &command_str);

    let mut child = powershell::create_powershell_command(&command_str)
        .spawn()
        .map_err(|e| format!("Failed to spawn 'scoop virustotal': {}", e))?;

    let stdout = child.stdout.take().expect("child did not have a handle to stdout");
    let stderr = child.stderr.take().expect("child did not have a handle to stderr");
    let mut stdout_reader = BufReader::new(stdout).lines();
    let mut stderr_reader = BufReader::new(stderr).lines();

    let window_clone = window.clone();
    tokio::spawn(async move {
        while let Ok(Some(line)) = stdout_reader.next_line().await {
            log::info!("virustotal stdout: {}", &line);
            let _ = window_clone.emit("operation-output", crate::commands::powershell::StreamOutput { line, source: "stdout".to_string() });
        }
    });
    
    let window_clone = window.clone();
    tokio::spawn(async move {
        while let Ok(Some(line)) = stderr_reader.next_line().await {
            log::error!("virustotal stderr: {}", &line);
            let _ = window_clone.emit("operation-output", crate::commands::powershell::StreamOutput { line, source: "stderr".to_string() });
        }
    });

    let status = child.wait().await.map_err(|e| format!("Failed to wait on child process: {}", e))?;

    let exit_code = status.code().unwrap_or(1); // Default to error if no code

    let result = match exit_code {
        0 => VirustotalResult {
            detections_found: false,
            is_api_key_missing: false,
            message: "No threats found.".to_string(),
        },
        2 => VirustotalResult {
            detections_found: true,
            is_api_key_missing: false,
            message: "VirusTotal found one or more detections.".to_string(),
        },
        16 => VirustotalResult {
            detections_found: false,
            is_api_key_missing: true,
            message: "VirusTotal API key is not configured.".to_string(),
        },
        _ => VirustotalResult {
            detections_found: true, // Treat other errors as a failure/warning state
            is_api_key_missing: false,
            message: format!("Scan failed with exit code {}. Please check the output.", exit_code),
        },
    };

    log::info!("VirusTotal scan finished: {:?}", result);
    window.emit("virustotal-scan-finished", result)
        .map_err(|e| format!("Failed to emit scan result: {}", e))?;

    Ok(())
} 
use crate::commands::powershell;
use serde::Serialize;
use tauri::{Emitter, Window};
use tokio::io::{AsyncBufReadExt, BufReader};

/// Represents the result of a VirusTotal scan.
#[derive(Serialize, Clone, Debug)]
pub struct VirustotalResult {
    /// True if any detections were found.
    detections_found: bool,
    /// True if the scan failed because the API key is missing.
    is_api_key_missing: bool,
    /// A human-readable message summarizing the result.
    message: String,
}

/// Scans a package using `scoop virustotal` and emits the results.
///
/// This command streams its output to the frontend and emits a `virustotal-scan-finished`
/// event with a `VirustotalResult` payload upon completion.
#[tauri::command]
pub async fn scan_package(
    window: Window,
    package_name: String,
    bucket: String,
) -> Result<(), String> {
    // The `bucket` parameter may be an empty string or the literal "None"
    // if the user does not specify a bucket.
    let command_str = if bucket.is_empty() || bucket.eq_ignore_ascii_case("none") {
        format!("scoop virustotal {}", package_name)
    } else {
        format!("scoop virustotal {}/{}", bucket, package_name)
    };

    log::info!("Executing VirusTotal scan: {}", &command_str);

    let mut child = powershell::create_powershell_command(&command_str)
        .spawn()
        .map_err(|e| format!("Failed to spawn 'scoop virustotal': {}", e))?;

    // We manually handle stream output here because `scoop virustotal` has a unique
    // set of exit codes that don't fit the standard success/fail model of the
    // generic `run_and_stream_command` function.

    // Capture stdout and stderr.
    let stdout = child
        .stdout
        .take()
        .ok_or("Child process did not have a handle to stdout")?;
    let stderr = child
        .stderr
        .take()
        .ok_or("Child process did not have a handle to stderr")?;

    let mut stdout_reader = BufReader::new(stdout).lines();
    let mut stderr_reader = BufReader::new(stderr).lines();

    // Spawn tasks to forward output to the frontend.
    let window_clone = window.clone();
    tokio::spawn(async move {
        while let Ok(Some(line)) = stdout_reader.next_line().await {
            log::info!("virustotal stdout: {}", &line);
            if let Err(e) = window_clone.emit(
                "operation-output",
                powershell::StreamOutput {
                    line,
                    source: "stdout".to_string(),
                },
            ) {
                log::error!("Failed to emit stdout event: {}", e);
            }
        }
    });

    let window_clone = window.clone();
    tokio::spawn(async move {
        while let Ok(Some(line)) = stderr_reader.next_line().await {
            log::error!("virustotal stderr: {}", &line);
            if let Err(e) = window_clone.emit(
                "operation-output",
                powershell::StreamOutput {
                    line,
                    source: "stderr".to_string(),
                },
            ) {
                log::error!("Failed to emit stderr event: {}", e);
            }
        }
    });

    // Wait for the command to finish.
    let status = child
        .wait()
        .await
        .map_err(|e| format!("Failed to wait on child process: {}", e))?;
    let exit_code = status.code().unwrap_or(1); // Default to a generic error code.

    // Interpret the exit code to determine the scan result.
    // See: https://github.com/rasa/scoop-virustotal#exit-codes
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
            detections_found: true, // Treat other errors as a failure/warning state.
            is_api_key_missing: false,
            message: format!(
                "Scan failed with an unexpected error (exit code {}). Please check the output.",
                exit_code
            ),
        },
    };

    log::info!("VirusTotal scan finished: {:?}", result);

    window
        .emit("virustotal-scan-finished", result)
        .map_err(|e| format!("Failed to emit scan result: {}", e))?;

    Ok(())
}

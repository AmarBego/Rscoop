//! VirusTotal scan runner. Scans are driven by the OperationManager — output
//! streams into the current op's buffer via `operations::append_output`, and
//! the structured outcome is returned so the runner can decide whether to
//! chain into install or halt with a warning.
use crate::commands::powershell;
use crate::operations;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tokio::io::{AsyncBufReadExt, BufReader};

/// Structured outcome of a `scoop virustotal` run. Mirrors the original
/// three-way exit code split from https://github.com/rasa/scoop-virustotal.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ScanWarning {
    pub detections_found: bool,
    pub is_api_key_missing: bool,
    pub message: String,
}

#[derive(Debug, Clone)]
pub enum ScanOutcome {
    Clean,
    Warning(ScanWarning),
}

/// Run `scoop virustotal <bucket>/<package>` and stream output through the
/// OperationManager. Returns a structured outcome.
pub async fn run_scan(
    app: AppHandle,
    package_name: &str,
    bucket: Option<&str>,
) -> Result<ScanOutcome, String> {
    let command_str = match bucket {
        Some(b) => format!("scoop virustotal {}/{}", b, package_name),
        None => format!("scoop virustotal {}", package_name),
    };
    log::info!("Executing VirusTotal scan: {}", &command_str);

    let mut child = powershell::create_powershell_command(&command_str)
        .spawn()
        .map_err(|e| format!("Failed to spawn 'scoop virustotal': {}", e))?;

    let stdout = child
        .stdout
        .take()
        .ok_or("Child process did not have a handle to stdout")?;
    let stderr = child
        .stderr
        .take()
        .ok_or("Child process did not have a handle to stderr")?;

    let app_stdout = app.clone();
    let stdout_task = tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            log::info!("virustotal stdout: {}", &line);
            operations::append_output(&app_stdout, line, "stdout");
        }
    });

    let app_stderr = app.clone();
    let stderr_task = tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            log::error!("virustotal stderr: {}", &line);
            operations::append_output(&app_stderr, line, "stderr");
        }
    });

    let status = child
        .wait()
        .await
        .map_err(|e| format!("Failed to wait on child process: {}", e))?;

    // Make sure the reader tasks drained before we return.
    let _ = stdout_task.await;
    let _ = stderr_task.await;

    let exit_code = status.code().unwrap_or(1);
    let outcome = match exit_code {
        0 => ScanOutcome::Clean,
        2 => ScanOutcome::Warning(ScanWarning {
            detections_found: true,
            is_api_key_missing: false,
            message: "VirusTotal found one or more detections.".to_string(),
        }),
        16 => ScanOutcome::Warning(ScanWarning {
            detections_found: false,
            is_api_key_missing: true,
            message: "VirusTotal API key is not configured.".to_string(),
        }),
        n => ScanOutcome::Warning(ScanWarning {
            detections_found: true,
            is_api_key_missing: false,
            message: format!(
                "Scan failed with an unexpected error (exit code {}). Please check the output.",
                n
            ),
        }),
    };

    log::info!("VirusTotal scan finished: {:?}", outcome);
    Ok(outcome)
}

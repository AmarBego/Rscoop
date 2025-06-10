use serde::Serialize;
use tauri::{Emitter, Listener, Window};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::oneshot;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

pub const EVENT_OUTPUT: &str = "operation-output";
pub const EVENT_FINISHED: &str = "operation-finished";
pub const EVENT_CANCEL: &str = "cancel-operation";

/// Struct for streaming output lines.
#[derive(Serialize, Clone)]
pub struct StreamOutput {
    pub line: String,
    pub source: String, // "stdout" or "stderr"
}

/// Struct for the final result of a command.
#[derive(Serialize, Clone)]
pub struct CommandResult {
    pub success: bool,
    pub message: String,
}

/// Creates a tokio::process::Command for running a PowerShell command without a visible window.
pub fn create_powershell_command(command_str: &str) -> Command {
    let mut cmd = Command::new("powershell");
    cmd.args(["-NoProfile", "-Command", command_str])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    
    // Prevents a console window from appearing on Windows.
    #[cfg(windows)]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    cmd
}

/// For long-running commands that stream output.
/// Emits `output_event` with `StreamOutput` for each line.
/// Emits `finished_event` with `CommandResult` when done.
/// Listens for `cancel_event` to kill the process.
pub async fn run_and_stream_command(
    window: Window,
    command_str: String,
    operation_name: String,
    output_event: &str,
    finished_event: &str,
    cancel_event: &str,
) -> Result<(), String> {
    log::info!("Executing streaming command: {}", &command_str);

    let mut child = create_powershell_command(&command_str).spawn()
        .map_err(|e| format!("Failed to spawn command '{}': {}", command_str, e))?;

    let stdout = child.stdout.take().expect("child did not have a handle to stdout");
    let stderr = child.stderr.take().expect("child did not have a handle to stderr");
    let mut stdout_reader = BufReader::new(stdout).lines();
    let mut stderr_reader = BufReader::new(stderr).lines();

    // This flag will be used to track if we've seen an error in the output.
    let error_detected = Arc::new(AtomicBool::new(false));

    let window_clone = window.clone();
    let output_event_str = output_event.to_string();
    let output_event_str_clone = output_event_str.clone();
    let error_detected_stdout = error_detected.clone();
    tokio::spawn(async move {
        while let Ok(Some(line)) = stdout_reader.next_line().await {
            log::info!("stdout: {}", &line);
            
            let lower_line = line.to_lowercase();
            // Check for common error patterns from scoop.
            if lower_line.starts_with("error") || lower_line.contains("failed") || lower_line.contains("skip") {
                error_detected_stdout.store(true, Ordering::SeqCst);
            }

            if let Err(e) = window_clone.emit(&output_event_str, StreamOutput { line, source: "stdout".to_string() }) {
                log::error!("Failed to emit stdout event: {}", e);
            }
        }
    });

    let window_clone = window.clone();
    let error_detected_stderr = error_detected.clone();
    tokio::spawn(async move {
        while let Ok(Some(line)) = stderr_reader.next_line().await {
             log::error!("stderr: {}", &line);
             // Any output on stderr is considered an error for these operations.
             error_detected_stderr.store(true, Ordering::SeqCst);
             if let Err(e) = window_clone.emit(&output_event_str_clone, StreamOutput { line, source: "stderr".to_string() }) {
                 log::error!("Failed to emit stderr event: {}", e);
             }
        }
    });

    let (cancel_tx, cancel_rx) = oneshot::channel::<()>();
    let mut cancel_tx_opt = Some(cancel_tx);
    let op_name = operation_name.clone();
    let _cancellation_receiver = window.once(cancel_event, move |_| {
        log::warn!("Received cancellation request for {}", op_name);
        if let Some(tx) = cancel_tx_opt.take() {
            let _ = tx.send(());
        }
    });

    let finished_event_str = finished_event.to_string();
    tokio::select! {
        status_res = child.wait() => {
            let status = status_res.map_err(|e| format!("Failed to wait on child process for {}: {}", operation_name, e))?;
            log::info!("{} finished with status: {}", operation_name, status);

            // The operation is only successful if the exit code is 0 AND we didn't detect an error in the output.
            let was_successful = status.success() && !error_detected.load(Ordering::SeqCst);

            let message = if was_successful {
                format!("{} completed successfully", operation_name)
            } else {
                format!("{} failed. Please check the output for details.", operation_name)
            };

            if let Err(e) = window.emit(&finished_event_str, CommandResult { success: was_successful, message: message.clone() }) {
                log::error!("Failed to emit finished event: {}", e);
            }

            if was_successful {
                Ok(())
            } else {
                Err(message)
            }
        },
        _ = cancel_rx => {
            if let Err(e) = child.kill().await {
                let err_msg = format!("Failed to kill child process for '{}': {}", operation_name, e);
                log::error!("{}", err_msg);
                if let Err(e) = window.emit(&finished_event_str, CommandResult { success: false, message: err_msg.clone() }) {
                    log::error!("Failed to emit finished event on kill failure: {}", e);
                }
                return Err(err_msg);
            }

            let cancel_msg = format!("{} was cancelled.", operation_name);
            log::info!("{}", cancel_msg);
            if let Err(e) = window.emit(&finished_event_str, CommandResult { success: false, message: cancel_msg.clone() }) {
                log::error!("Failed to emit cancellation event: {}", e);
            }
            Err(cancel_msg)
        }
    }
} 
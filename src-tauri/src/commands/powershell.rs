use crate::operations;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Listener};
use tokio::io::{AsyncBufReadExt, AsyncRead, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::oneshot;

pub use crate::operations::EVENT_CANCEL;

/// Creates a `tokio::process::Command` for running a PowerShell command without a visible window.
pub fn create_powershell_command(command_str: &str) -> Command {
    let mut cmd = Command::new("powershell");
    cmd.args(["-NoLogo", "-NoProfile", "-Command",
        // Ensure core modules are available — `-NoProfile` can prevent
        // auto-loading of modules like Microsoft.PowerShell.Utility
        // which provides Get-FileHash and other cmdlets scoop needs.
        &format!("Import-Module Microsoft.PowerShell.Utility -ErrorAction SilentlyContinue; {}", command_str),
    ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Prevents a console window from appearing on Windows.
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW

    cmd
}

fn spawn_output_stream_handler(
    stream: impl AsyncRead + Unpin + Send + 'static,
    source: &'static str,
    app: AppHandle,
    has_error: Arc<AtomicBool>,
) {
    let mut reader = BufReader::new(stream).lines();
    tokio::spawn(async move {
        while let Ok(Some(line)) = reader.next_line().await {
            if source == "stderr" || line.to_lowercase().contains("error") {
                has_error.store(true, Ordering::Relaxed);
            }
            operations::append_output(&app, line, source);
        }
    });
}

/// Executes a long-running command and streams its output through the
/// OperationManager (so it lands in the current op's ring buffer and is
/// broadcast to whatever window currently exists).
///
/// The caller is expected to have already registered an "active" operation
/// via `operations::enqueue`. This function only produces output lines and
/// returns Ok/Err — it does NOT emit the `operation-finished` event; that
/// is the manager's responsibility.
pub async fn run_and_stream(
    app: AppHandle,
    command_str: String,
    operation_name: String,
) -> Result<(), String> {
    log::info!("Executing streaming command: {}", &command_str);

    let mut child = create_powershell_command(&command_str)
        .spawn()
        .map_err(|e| format!("Failed to spawn command '{}': {}", command_str, e))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| format!("Child process did not have a handle to stdout for '{}'", command_str))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| format!("Child process did not have a handle to stderr for '{}'", command_str))?;

    let has_error = Arc::new(AtomicBool::new(false));
    let (cancel_tx, cancel_rx) = oneshot::channel::<()>();
    let mut cancel_tx_opt = Some(cancel_tx);

    // Register a one-shot cancel listener on the AppHandle. Because listeners
    // survive window destruction, the tray-hide → reopen flow still cancels
    // the right op.
    let cancel_handle = app.once(EVENT_CANCEL, move |_| {
        log::warn!("Received cancellation request");
        if let Some(tx) = cancel_tx_opt.take() {
            let _ = tx.send(());
        }
    });

    spawn_output_stream_handler(stdout, "stdout", app.clone(), has_error.clone());
    spawn_output_stream_handler(stderr, "stderr", app.clone(), has_error.clone());

    let result = tokio::select! {
        status_res = child.wait() => {
            handle_completion(status_res, &operation_name, has_error)
        },
        _ = cancel_rx => {
            handle_cancellation(child, &operation_name).await
        }
    };

    // Always unregister the cancel listener so we don't leak closures.
    app.unlisten(cancel_handle);

    result
}

fn handle_completion(
    status_res: Result<std::process::ExitStatus, std::io::Error>,
    operation_name: &str,
    has_error: Arc<AtomicBool>,
) -> Result<(), String> {
    let status = status_res.map_err(|e| {
        format!("Failed to wait on child process for {}: {}", operation_name, e)
    })?;
    log::info!("{} finished with status: {}", operation_name, status);

    if status.success() && !has_error.load(Ordering::Relaxed) {
        Ok(())
    } else {
        Err(format!(
            "{} failed. Please check the output for details.",
            operation_name
        ))
    }
}

async fn handle_cancellation(mut child: Child, operation_name: &str) -> Result<(), String> {
    if let Err(e) = child.kill().await {
        let err_msg = format!(
            "Failed to kill child process for '{}': {}",
            operation_name, e
        );
        log::error!("{}", err_msg);
        return Err(err_msg);
    }
    let cancel_msg = format!("{} was cancelled.", operation_name);
    log::info!("{}", cancel_msg);
    Err(cancel_msg)
}

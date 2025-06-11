use super::powershell::{self, EVENT_CANCEL, EVENT_FINISHED, EVENT_OUTPUT};
use tauri::Window;

/// Defines the supported Scoop operations.
#[derive(Debug, Clone, Copy)]
pub enum ScoopOp {
    Install,
    Uninstall,
    Update,
    ClearCache,
    UpdateAll,
}

/// Builds a Scoop command as a string, returning an error if a required
/// package name is missing.
fn build_scoop_cmd(
    op: ScoopOp,
    package: Option<&str>,
    bucket: Option<&str>,
) -> Result<String, String> {
    let command = match op {
        ScoopOp::Install => {
            let pkg = package.ok_or("A package name is required to install.")?;
            match bucket {
                Some(b) => format!("scoop install {}/{}", b, pkg),
                None => format!("scoop install {}", pkg),
            }
        }
        ScoopOp::Uninstall => {
            let pkg = package.ok_or("A package name is required to uninstall.")?;
            format!("scoop uninstall {}", pkg)
        }
        ScoopOp::Update => {
            let pkg = package.ok_or("A package name is required to update.")?;
            format!("scoop update {}", pkg)
        }
        ScoopOp::ClearCache => {
            let pkg = package.ok_or("A package name is required to clear the cache.")?;
            format!("scoop cache rm {}", pkg)
        }
        ScoopOp::UpdateAll => "scoop update *".to_string(),
    };

    Ok(command)
}

/// Executes a Scoop operation and streams the output to the frontend.
///
/// This function builds the Scoop command, creates a human-friendly operation
/// name for the UI, and then executes it using the PowerShell runner.
pub async fn execute_scoop(
    window: Window,
    op: ScoopOp,
    package: Option<&str>,
    bucket: Option<&str>,
) -> Result<(), String> {
    let cmd = build_scoop_cmd(op, package, bucket)?;

    let op_name = match (op, package) {
        (ScoopOp::Install, Some(pkg)) => format!("Installing {}", pkg),
        (ScoopOp::Uninstall, Some(pkg)) => format!("Uninstalling {}", pkg),
        (ScoopOp::Update, Some(pkg)) => format!("Updating {}", pkg),
        (ScoopOp::ClearCache, Some(pkg)) => format!("Clearing cache for {}", pkg),
        (ScoopOp::UpdateAll, _) => "Updating all packages".to_string(),
        // This case should not be reached if `build_scoop_cmd` is correct.
        _ => return Err("Invalid operation or missing package name.".to_string()),
    };

    powershell::run_and_stream_command(window, cmd, op_name, EVENT_OUTPUT, EVENT_FINISHED, EVENT_CANCEL).await
}

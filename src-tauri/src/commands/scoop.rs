use tauri::Window;

use super::powershell::{self, EVENT_CANCEL, EVENT_FINISHED, EVENT_OUTPUT};

/// Common scoop sub-commands support.
#[derive(Debug, Clone, Copy)]
pub enum ScoopOp {
    Install,
    Uninstall,
    Update,
    ClearCache,
    UpdateAll,
}

impl ScoopOp {
    fn verb(self) -> &'static str {
        match self {
            ScoopOp::Install => "install",
            ScoopOp::Uninstall => "uninstall",
            ScoopOp::Update => "update",
            ScoopOp::ClearCache => "cache rm",
            ScoopOp::UpdateAll => "update *",
        }
    }
}

/// Builds a textual `scoop` command.
fn build_scoop_cmd(op: ScoopOp, package: Option<&str>, bucket: Option<&str>) -> String {
    match op {
        ScoopOp::UpdateAll => "scoop update *".to_string(),
        ScoopOp::ClearCache => {
            let pkg = package.expect("package required for cache clear");
            format!("scoop cache rm {}", pkg)
        }
        _ => {
            let pkg = package.expect("package required for this operation");
            match bucket {
                Some(b) => format!("scoop {} {}/{}", op.verb(), b, pkg),
                None => format!("scoop {} {}", op.verb(), pkg),
            }
        }
    }
}

/// Executes a scoop operation via [`powershell::run_and_stream_command`].
pub async fn execute_scoop(
    window: Window,
    op: ScoopOp,
    package: Option<&str>,
    bucket: Option<&str>,
) -> Result<(), String> {
    let cmd = build_scoop_cmd(op, package, bucket);

    // Produce a human-friendly operation name for the UI.
    let op_name = match op {
        ScoopOp::Install => format!("Installing {}", package.unwrap_or("")),
        ScoopOp::Uninstall => format!("Uninstalling {}", package.unwrap_or("")),
        ScoopOp::Update => format!("Updating {}", package.unwrap_or("")),
        ScoopOp::ClearCache => format!("Clearing cache for {}", package.unwrap_or("")),
        ScoopOp::UpdateAll => "Updating all packages".to_string(),
    };

    powershell::run_and_stream_command(window, cmd, op_name, EVENT_OUTPUT, EVENT_FINISHED, EVENT_CANCEL).await
}

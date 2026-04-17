use super::powershell;
use tauri::AppHandle;

/// Defines the supported Scoop operations.
#[derive(Debug, Clone, Copy)]
pub enum ScoopOp {
    Install,
    Uninstall,
    Update,
    ClearCache,
    UpdateAll,
}

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

/// Executes a Scoop operation and streams output through the OperationManager.
pub async fn execute_scoop(
    app: AppHandle,
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
        _ => return Err("Invalid operation or missing package name.".to_string()),
    };

    powershell::run_and_stream(app, cmd, op_name).await
}

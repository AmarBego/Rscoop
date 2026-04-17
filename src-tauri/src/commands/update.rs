//! Package update helpers. User-facing update operations go through the
//! OperationManager; this file retains only the headless variant used by
//! the background scheduler.
use crate::commands::auto_cleanup::trigger_auto_cleanup;
use crate::commands::powershell;
use crate::state::AppState;
use tauri::{AppHandle, State};

/// Headless variant used by background scheduler (no UI streaming).
pub async fn update_all_packages_headless(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("(Headless) Updating all packages");
    let output = powershell::create_powershell_command("scoop update *")
        .output()
        .await
        .map_err(|e| format!("Failed to execute scoop update *: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        log::warn!(
            "Headless update_all_packages exited with status: {}. Error: {}",
            output.status,
            stderr
        );
        return Err("Headless package update failed".to_string());
    }

    trigger_auto_cleanup(app, state).await;
    log::info!("Headless package update completed successfully");
    Ok(())
}

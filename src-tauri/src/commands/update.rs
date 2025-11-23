use crate::commands::auto_cleanup::trigger_auto_cleanup;
use crate::commands::scoop::{self, ScoopOp};
use crate::state::AppState;
use tauri::{AppHandle, State, Window};

/// Updates a specific Scoop package.
#[tauri::command]
pub async fn update_package(
    window: Window,
    app: AppHandle,
    state: State<'_, AppState>,
    package_name: String,
) -> Result<(), String> {
    log::info!("Updating package '{}'", package_name);
    scoop::execute_scoop(window, ScoopOp::Update, Some(&package_name), None).await?;

    // Trigger auto cleanup after update
    trigger_auto_cleanup(app, state).await;

    Ok(())
}

/// Updates all Scoop packages.
#[tauri::command]
pub async fn update_all_packages(
    window: Window,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Updating all packages");
    scoop::execute_scoop(window, ScoopOp::UpdateAll, None, None).await?;

    // Trigger auto cleanup after update all
    trigger_auto_cleanup(app, state).await;

    Ok(())
}

/// Headless variant used by background scheduler (no UI streaming). Emits minimal log output.
pub async fn update_all_packages_headless(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    use crate::commands::powershell;

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

    // Trigger auto cleanup after successful headless update
    trigger_auto_cleanup(app, state).await;
    log::info!("Headless package update completed successfully");
    Ok(())
}

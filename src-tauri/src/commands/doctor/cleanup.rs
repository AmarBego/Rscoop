//! Cleanup operations. All streaming cleanup flows run through the
//! OperationManager — callers should enqueue `CleanupApps` / `CleanupCache`
//! actions rather than invoke these directly.
use crate::commands::installed::get_installed_packages_full;
use crate::commands::powershell;
use crate::state::AppState;
use tauri::{AppHandle, Manager};

/// Cleans up old versions of regular apps (versioned installs are excluded).
pub async fn cleanup_all_apps_internal(app: AppHandle) -> Result<(), String> {
    log::info!("Running cleanup of old app versions");
    let state = app.state::<AppState>();
    let installed_packages = get_installed_packages_full(app.clone(), state.clone()).await?;

    let versioned_count = installed_packages
        .iter()
        .filter(|pkg| pkg.is_versioned_install)
        .count();

    if versioned_count > 0 {
        log::warn!(
            "Found {} versioned installs. These will be EXCLUDED from cleanup.",
            versioned_count
        );
        let regular_packages: Vec<String> = installed_packages
            .iter()
            .filter(|pkg| !pkg.is_versioned_install)
            .map(|pkg| pkg.name.clone())
            .collect();

        if regular_packages.is_empty() {
            log::info!("All packages are versioned installs - no cleanup needed");
            return Ok(());
        }

        let command = format!("scoop cleanup {}", regular_packages.join(" "));
        powershell::run_and_stream(app, command, "Cleanup Old App Versions".to_string()).await
    } else {
        powershell::run_and_stream(
            app,
            "scoop cleanup --all".to_string(),
            "Cleanup Old App Versions".to_string(),
        )
        .await
    }
}

/// Cleans up cache for regular apps (versioned installs are excluded).
pub async fn cleanup_outdated_cache_internal(app: AppHandle) -> Result<(), String> {
    log::info!("Running version-aware cleanup of outdated app caches");
    let state = app.state::<AppState>();
    let installed_packages = get_installed_packages_full(app.clone(), state.clone()).await?;

    let safe_packages: Vec<String> = installed_packages
        .iter()
        .filter(|pkg| !pkg.is_versioned_install)
        .map(|pkg| pkg.name.clone())
        .collect();

    if safe_packages.is_empty() {
        log::info!("No packages found that are safe for cache cleanup");
        return Ok(());
    }

    let command = format!("scoop cleanup {} --cache", safe_packages.join(" "));
    powershell::run_and_stream(app, command, "Cleanup Outdated App Caches".to_string()).await
}

/// Force-cleanup ALL apps including versioned installs. Kept as a separate
/// Tauri command because it bypasses the normal queue (used from a dangerous
/// settings toggle, not the Doctor page).
#[tauri::command]
pub async fn cleanup_all_apps_force(app: AppHandle) -> Result<(), String> {
    log::warn!("Running FORCE cleanup of ALL app versions (including versioned installs)");
    powershell::run_and_stream(
        app,
        "scoop cleanup --all".to_string(),
        "Force Cleanup All App Versions".to_string(),
    )
    .await
}

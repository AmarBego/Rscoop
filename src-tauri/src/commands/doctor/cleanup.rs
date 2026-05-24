//! Cleanup operations. All streaming cleanup flows run through the
//! OperationManager — callers should enqueue `CleanupApps` / `CleanupCache`
//! actions rather than invoke these directly.
use crate::commands::doctor::cache;
use crate::commands::installed::get_installed_packages_full;
use crate::commands::scoop;
use crate::operations;
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

        let mut args = vec!["cleanup".to_string()];
        args.extend(regular_packages);
        run_cleanup(app, args, "Cleanup Old App Versions").await
    } else {
        run_cleanup(
            app,
            vec!["cleanup".to_string(), "--all".to_string()],
            "Cleanup Old App Versions",
        )
        .await
    }
}

/// Cleans up cache for regular apps (versioned installs are excluded).
pub async fn cleanup_outdated_cache_internal(app: AppHandle) -> Result<(), String> {
    log::info!("Running version-aware cleanup of Scoop download cache");
    operations::append_output(
        &app,
        "Scanning Scoop cache directory for safe-to-delete files...".to_string(),
        "stdout",
    );

    let result = cache::cleanup_outdated_cache_for_packages_internal(app.clone(), None).await?;

    for file in result.deleted.iter().take(100) {
        operations::append_output(&app, format!("Deleted cache file: {}", file), "stdout");
    }
    if result.deleted.len() > 100 {
        operations::append_output(
            &app,
            format!("...and {} more cache files", result.deleted.len() - 100),
            "stdout",
        );
    }
    if !result.failed.is_empty() {
        for (file, reason) in &result.failed {
            operations::append_output(
                &app,
                format!("Failed to delete {}: {}", file, reason),
                "stderr",
            );
        }
        return Err(format!(
            "Failed to delete {} cache file(s)",
            result.failed.len()
        ));
    }

    operations::append_output(
        &app,
        format!("Deleted {} outdated cache file(s)", result.deleted.len()),
        "stdout",
    );
    Ok(())
}

async fn run_cleanup(app: AppHandle, args: Vec<String>, label: &str) -> Result<(), String> {
    let outcome = scoop::run_scoop_operation(app, args, label).await?;
    if outcome.is_success() {
        Ok(())
    } else {
        Err(outcome.message())
    }
}

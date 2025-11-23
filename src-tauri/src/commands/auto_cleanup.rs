//! Commands for automatic cleanup based on user settings.
use crate::commands::installed::get_installed_packages_full;
use crate::commands::powershell;
use crate::commands::settings;
use crate::state::AppState;
use serde::Deserialize;
use std::path::PathBuf;
use tauri::{AppHandle, Runtime, State};

/// Settings for automatic cleanup operations.
#[derive(Debug, Deserialize)]
pub struct CleanupSettings {
    #[serde(rename = "autoCleanupEnabled")]
    pub auto_cleanup_enabled: bool,
    #[serde(rename = "cleanupOldVersions")]
    pub cleanup_old_versions: bool,
    #[serde(rename = "cleanupCache")]
    pub cleanup_cache: bool,
    #[serde(rename = "preserveVersionCount")]
    pub preserve_version_count: usize,
}

/// Runs the auto cleanup operation silently in the background based on user settings.
///
/// This function is designed to be called after package operations (install, update, uninstall)
/// to automatically clean up old versions and/or cache without user intervention.
#[tauri::command]
pub async fn run_auto_cleanup<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    settings: CleanupSettings,
) -> Result<(), String> {
    if !settings.auto_cleanup_enabled {
        log::debug!("Auto cleanup is disabled, skipping");
        return Ok(());
    }

    log::info!("Running auto cleanup with settings: {:?}", settings);

    // Get all installed packages to identify versioned installs
    let installed_packages = get_installed_packages_full(app.clone(), state.clone()).await?;

    // Separate regular packages from versioned installs
    let regular_packages: Vec<String> = installed_packages
        .iter()
        .filter(|pkg| !pkg.is_versioned_install)
        .map(|pkg| pkg.name.clone())
        .collect();

    let versioned_packages: Vec<String> = installed_packages
        .iter()
        .filter(|pkg| pkg.is_versioned_install)
        .map(|pkg| pkg.name.clone())
        .collect();

    log::info!(
        "Found {} regular packages and {} versioned installs",
        regular_packages.len(),
        versioned_packages.len()
    );

    // Run cleanup operations based on settings
    let scoop_path = state.scoop_path();

    if settings.cleanup_old_versions && !regular_packages.is_empty() {
        log::info!(
            "Running auto cleanup of old versions (preserving {} versions)",
            settings.preserve_version_count
        );
        cleanup_old_versions_smart(
            &scoop_path,
            &regular_packages,
            settings.preserve_version_count,
        )
        .await?;
    }

    if settings.cleanup_cache && !regular_packages.is_empty() {
        log::info!("Running auto cleanup of outdated cache");
        cleanup_cache_for_packages(&regular_packages).await?;
    }

    log::info!("Auto cleanup completed successfully");
    Ok(())
}

/// Cleans up old versions of packages while preserving the most recent N versions.
///
/// This function reads the version directories for each package and removes the oldest
/// versions while keeping the specified number of recent versions.
async fn cleanup_old_versions_smart(
    scoop_path: &PathBuf,
    packages: &[String],
    keep_count: usize,
) -> Result<(), String> {
    let apps_path = scoop_path.join("apps");

    for package_name in packages {
        let package_path = apps_path.join(package_name);
        if !package_path.is_dir() {
            continue;
        }

        let versions_to_remove = get_versions_to_remove(&package_path, keep_count)?;

        if !versions_to_remove.is_empty() {
            log::debug!(
                "Package '{}' has {} old versions to remove",
                package_name,
                versions_to_remove.len()
            );

            remove_specific_versions(scoop_path, package_name, &versions_to_remove).await;
        }
    }

    Ok(())
}

fn get_versions_to_remove(
    package_path: &PathBuf,
    keep_count: usize,
) -> Result<Vec<String>, String> {
    // Read all version directories (excluding "current" symlink)
    let mut versions: Vec<String> = std::fs::read_dir(package_path)
        .map_err(|e| format!("Failed to read package directory: {}", e))?
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let file_name = entry.file_name().to_string_lossy().to_string();

            // Skip "current" symlink and non-directories
            if file_name == "current" || !entry.file_type().ok()?.is_dir() {
                return None;
            }

            Some(file_name)
        })
        .collect();

    // If we have more versions than we want to keep, identify the old ones
    if versions.len() > keep_count {
        // Sort versions (lexicographically - good enough for most version formats)
        versions.sort();

        // Calculate how many to remove
        let remove_count = versions.len() - keep_count;
        Ok(versions.into_iter().take(remove_count).collect())
    } else {
        Ok(Vec::new())
    }
}

async fn remove_specific_versions(scoop_path: &PathBuf, package_name: &str, versions: &[String]) {
    let package_dir = scoop_path.join("apps").join(package_name);

    for version in versions {
        let version_dir = package_dir.join(version);
        log::info!("Removing old version directory: {}", version_dir.display());

        if let Err(e) = std::fs::remove_dir_all(&version_dir) {
            log::warn!(
                "Failed to remove version directory {}: {}",
                version_dir.display(),
                e
            );
        } else {
            log::debug!("Successfully removed version {}", version);
        }
    }
}

/// Cleans up the cache for specified packages.
async fn cleanup_cache_for_packages(packages: &[String]) -> Result<(), String> {
    if packages.is_empty() {
        return Ok(());
    }

    let packages_str = packages.join(" ");
    let command = format!("scoop cleanup {} --cache", packages_str);

    match powershell::create_powershell_command(&command)
        .output()
        .await
    {
        Ok(output) => {
            if !output.status.success() {
                log::warn!(
                    "Cache cleanup completed with warnings: {}",
                    String::from_utf8_lossy(&output.stderr)
                );
            } else {
                log::debug!(
                    "Successfully cleaned up cache for {} packages",
                    packages.len()
                );
            }
            Ok(())
        }
        Err(e) => {
            log::warn!("Failed to execute cache cleanup: {}", e);
            // Don't fail the entire operation if cache cleanup fails
            Ok(())
        }
    }
}

/// Helper function to trigger auto cleanup from other commands.
/// This reads the cleanup settings from the store and runs the cleanup if enabled.
///
/// This function is designed to be called after operations like install, update, or uninstall.
pub async fn trigger_auto_cleanup<R: Runtime>(app: AppHandle<R>, state: State<'_, AppState>) {
    // Read cleanup settings from the store
    let cleanup_settings = match read_cleanup_settings(&app) {
        Ok(settings) => settings,
        Err(e) => {
            log::debug!("Could not read cleanup settings: {}", e);
            return;
        }
    };

    // If auto cleanup is not enabled, return early
    if !cleanup_settings.auto_cleanup_enabled {
        log::debug!("Auto cleanup is disabled");
        return;
    }

    log::info!("Triggering auto cleanup in background");

    // Run cleanup directly - it's already async and won't block
    if let Err(e) = run_auto_cleanup(app, state, cleanup_settings).await {
        log::warn!("Auto cleanup failed: {}", e);
    }
}

/// Reads cleanup settings from the persistent store.
fn read_cleanup_settings<R: Runtime>(app: &AppHandle<R>) -> Result<CleanupSettings, String> {
    let get_val = |key: &str| {
        settings::get_config_value(app.clone(), key.to_string())
            .ok()
            .flatten()
    };

    Ok(CleanupSettings {
        auto_cleanup_enabled: get_val("cleanup.autoCleanupEnabled")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        cleanup_old_versions: get_val("cleanup.cleanupOldVersions")
            .and_then(|v| v.as_bool())
            .unwrap_or(true),
        cleanup_cache: get_val("cleanup.cleanupCache")
            .and_then(|v| v.as_bool())
            .unwrap_or(true),
        preserve_version_count: get_val("cleanup.preserveVersionCount")
            .and_then(|v| v.as_u64())
            .unwrap_or(3) as usize,
    })
}

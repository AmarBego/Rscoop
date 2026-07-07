//! Command for checking for available updates for installed Scoop packages.
use crate::commands::installed::get_installed_packages_full;
use crate::models::{PackageManifest, ScoopPackage as InstalledPackage};
use crate::state::AppState;
use crate::utils::locate_package_manifest;
use rayon::prelude::*;
use serde::Serialize;
use std::fs;
use std::path::Path;
use tauri::{AppHandle, Runtime, State};

/// Represents a package that has a newer version available.
#[derive(Serialize, Debug)]
pub struct UpdatablePackage {
    pub name: String,
    pub current: String,
    pub available: String,
}

/// Checks a single package to see if a newer version is available in its manifest.
///
/// Returns `Ok(Some(UpdatablePackage))` if an update is found, `Ok(None)` if the package
/// is up-to-date, and `Err` if any error occurs during the process.
fn check_package_for_update(
    scoop_dir: &Path,
    package: &InstalledPackage,
) -> Result<Option<UpdatablePackage>, String> {
    // Locate the manifest for the package in its source bucket.
    let (manifest_path, _) =
        locate_package_manifest(scoop_dir, &package.name, Some(package.source.clone()))
            .map_err(|e| format!("Could not locate manifest for {}: {}", package.name, e))?;

    // Read and parse the manifest to get the latest version.
    let content = fs::read_to_string(manifest_path)
        .map_err(|e| format!("Could not read manifest for {}: {}", package.name, e))?;
    let manifest: PackageManifest = serde_json::from_str(&content)
        .map_err(|e| format!("Could not parse manifest for {}: {}", package.name, e))?;

    // Compare versions and return an UpdatablePackage if a new version is found.
    if package.version != manifest.version {
        Ok(Some(UpdatablePackage {
            name: package.name.clone(),
            current: package.version.clone(),
            available: manifest.version,
        }))
    } else {
        Ok(None)
    }
}

/// Checks all installed packages for newer manifest versions.
///
/// Held packages are reported too so the UI can show a passive update indicator;
/// callers decide whether the package can actually be updated.
#[tauri::command]
pub async fn check_for_updates<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
) -> Result<Vec<UpdatablePackage>, String> {
    log::info!("Checking for updates using filesystem");

    let installed_packages = get_installed_packages_full(app.clone(), state.clone()).await?;
    let scoop_path = state.scoop_path();

    // Check for updates in parallel.
    let installed_packages_clone = installed_packages.clone();
    let scoop_path_clone = scoop_path.clone();

    let updatable_packages = tokio::task::spawn_blocking(move || {
        installed_packages_clone
            .par_iter()
            .filter_map(|package| {
                match check_package_for_update(&scoop_path_clone, package) {
                    Ok(Some(updatable)) => Some(updatable),
                    Ok(None) => None, // Package is up-to-date
                    Err(e) => {
                        log::warn!(
                            "Could not check for update for package '{}': {}",
                            package.name,
                            e
                        );
                        None
                    }
                }
            })
            .collect::<Vec<UpdatablePackage>>()
    })
    .await
    .map_err(|e| e.to_string())?;

    log::info!("Found {} updatable packages", updatable_packages.len());
    Ok(updatable_packages)
}

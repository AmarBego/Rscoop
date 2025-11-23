//! Command for checking for available updates for installed Scoop packages.
use crate::commands::installed::get_installed_packages_full;
use crate::models::ScoopPackage as InstalledPackage;
use crate::state::AppState;
use crate::utils::locate_package_manifest;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
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

/// Represents the structure of a `manifest.json` file, used to extract the version.
#[derive(Deserialize, Debug)]
struct Manifest {
    version: String,
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
    let manifest: Manifest = serde_json::from_str(&content)
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

/// Checks all installed packages for available updates.
///
/// This command scans the filesystem, compares installed versions with the latest
/// available versions in the package manifests, and returns a list of packages
/// that can be updated. It respects packages that are on hold.
#[tauri::command]
pub async fn check_for_updates<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
) -> Result<Vec<UpdatablePackage>, String> {
    log::info!("Checking for updates using filesystem");

    let installed_packages = get_installed_packages_full(app.clone(), state.clone()).await?;
    let scoop_path = state.scoop_path();

    // Get a set of held packages for efficient lookup.
    let held_packages: HashSet<String> =
        crate::commands::hold::list_held_packages(app, state.clone())
            .await?
            .into_iter()
            .collect();

    // Check for updates in parallel.
    let installed_packages_clone = installed_packages.clone();
    let scoop_path_clone = scoop_path.clone();
    let held_packages_clone = held_packages.clone();

    let updatable_packages = tokio::task::spawn_blocking(move || {
        installed_packages_clone
            .par_iter()
            .filter(|p| !held_packages_clone.contains(&p.name)) // Exclude held packages
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

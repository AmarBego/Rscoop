//! Command for fetching all installed Scoop packages from the filesystem.
use crate::models::ScoopPackage;
use crate::utils;
use chrono::{DateTime, Utc};
use rayon::prelude::*;
use serde::Deserialize;
use std::fs;
use std::path::Path;
use tauri::{AppHandle, Runtime};

/// Represents the structure of a `manifest.json` file for an installed package.
#[derive(Deserialize, Debug)]
struct Manifest {
    description: String,
    version: String,
}

/// Represents the structure of an `install.json` file for an installed package.
#[derive(Deserialize, Debug)]
struct InstallManifest {
    bucket: String,
}

/// Loads the details for a single installed package from its directory.
fn load_package_details(package_path: &Path) -> Result<ScoopPackage, String> {
    let package_name = package_path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| format!("Invalid package directory name: {:?}", package_path))?
        .to_string();

    let current_path = package_path.join("current");
    if !current_path.is_dir() {
        return Err(format!("'current' directory not found for {}", package_name));
    }

    // Read and parse manifest.json
    let manifest_path = current_path.join("manifest.json");
    let manifest_content = fs::read_to_string(&manifest_path)
        .map_err(|e| format!("Failed to read manifest.json for {}: {}", package_name, e))?;
    let manifest: Manifest = serde_json::from_str(&manifest_content)
        .map_err(|e| format!("Failed to parse manifest.json for {}: {}", package_name, e))?;

    // Read and parse install.json
    let install_manifest_path = current_path.join("install.json");
    let install_manifest_content = fs::read_to_string(&install_manifest_path)
        .map_err(|e| format!("Failed to read install.json for {}: {}", package_name, e))?;
    let install_manifest: InstallManifest = serde_json::from_str(&install_manifest_content)
        .map_err(|e| format!("Failed to parse install.json for {}: {}", package_name, e))?;

    // Get the last modified time of the installation
    let updated_time = fs::metadata(&install_manifest_path)
        .and_then(|m| m.modified())
        .map(|t| DateTime::<Utc>::from(t).to_rfc3339())
        .unwrap_or_default();

    Ok(ScoopPackage {
        name: package_name,
        version: manifest.version,
        source: install_manifest.bucket,
        updated: updated_time,
        is_installed: true,
        info: manifest.description,
        ..Default::default()
    })
}

/// Fetches a list of all installed Scoop packages by scanning the filesystem.
#[tauri::command]
pub async fn get_installed_packages_full<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Vec<ScoopPackage>, String> {
    log::info!("Fetching installed packages from filesystem");

    let scoop_path = utils::resolve_scoop_root(app)?;
    let apps_path = scoop_path.join("apps");

    if !apps_path.is_dir() {
        log::warn!(
            "Scoop apps directory does not exist at: {}",
            apps_path.display()
        );
        return Ok(vec![]);
    }

    let app_dirs = fs::read_dir(apps_path)
        .map_err(|e| format!("Failed to read apps directory: {}", e))?
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_dir())
        .collect::<Vec<_>>();

    // Process packages in parallel for better performance
    let packages: Vec<ScoopPackage> = app_dirs
        .par_iter()
        .filter_map(|entry| {
            let path = entry.path();
            match load_package_details(&path) {
                Ok(package) => Some(package),
                Err(e) => {
                    log::warn!("Skipping package at '{}': {}", path.display(), e);
                    None
                }
            }
        })
        .collect();

    log::info!("Found {} installed packages", packages.len());
    Ok(packages)
}
 
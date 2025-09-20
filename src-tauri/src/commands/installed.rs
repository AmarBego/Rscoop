//! Command for fetching all installed Scoop packages from the filesystem.
use crate::models::ScoopPackage;
use crate::state::AppState;
use chrono::{DateTime, Utc};
use rayon::prelude::*;
use serde::Deserialize;
use std::fs;
use std::path::Path;
use tauri::{AppHandle, Runtime, State};

/// Represents the structure of a `manifest.json` file for an installed package.
#[derive(Deserialize, Debug)]
struct Manifest {
    description: String,
    version: String,
}

/// Represents the structure of an `install.json` file for an installed package.
#[derive(Deserialize, Debug)]
struct InstallManifest {
    bucket: Option<String>,
}

/// Searches for a package manifest in all bucket directories to determine the bucket.
fn find_package_bucket(scoop_path: &Path, package_name: &str) -> Option<String> {
    let buckets_path = scoop_path.join("buckets");
    
    if let Ok(buckets) = fs::read_dir(&buckets_path) {
        for bucket_entry in buckets.flatten() {
            if bucket_entry.path().is_dir() {
                let bucket_name = bucket_entry.file_name().to_string_lossy().to_string();
                // Look in the correct path: buckets/{bucket}/bucket/{package}.json
                let manifest_path = bucket_entry.path().join("bucket").join(format!("{}.json", package_name));
                
                if manifest_path.exists() {
                    return Some(bucket_name);
                }
            }
        }
    }
    
    // Fallback: check if it's in the main bucket (which might not be in buckets dir)
    None
}

/// Loads the details for a single installed package from its directory.
fn load_package_details(package_path: &Path, scoop_path: &Path) -> Result<ScoopPackage, String> {
    let package_name = package_path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| format!("Invalid package directory name: {:?}", package_path))?
        .to_string();

    let current_path = package_path.join("current");
    if !current_path.is_dir() {
        return Err(format!(
            "'current' directory not found for {}",
            package_name
        ));
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

    // Determine bucket - either from install.json or by searching buckets
    let bucket = install_manifest.bucket.clone()
        .or_else(|| find_package_bucket(scoop_path, &package_name))
        .unwrap_or_else(|| "main".to_string());

    // Check if this is a versioned install - versioned installs don't have a bucket field in install.json
    // AND cannot be found in any bucket directory (indicating custom/generated manifest)
    let is_versioned_install = install_manifest.bucket.is_none();

    // Get the last modified time of the installation
    let updated_time = fs::metadata(&install_manifest_path)
        .and_then(|m| m.modified())
        .map(|t| DateTime::<Utc>::from(t).to_rfc3339())
        .unwrap_or_default();

    Ok(ScoopPackage {
        name: package_name,
        version: manifest.version,
        source: bucket,
        updated: updated_time,
        is_installed: true,
        info: manifest.description,
        is_versioned_install,
        ..Default::default()
    })
}

/// Fetches a list of all installed Scoop packages by scanning the filesystem.
#[tauri::command]
pub async fn get_installed_packages_full<R: Runtime>(
    _app: AppHandle<R>,
    state: State<'_, AppState>,
) -> Result<Vec<ScoopPackage>, String> {
    let mut cache_guard = state.installed_packages.lock().await;

    // Check if the cache is populated
    if let Some(packages) = cache_guard.as_ref() {
        log::info!("Returning cached installed packages list.");
        return Ok(packages.clone());
    }
    log::info!("Fetching installed packages from filesystem");

    let apps_path = state.scoop_path.join("apps");

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
    let scoop_path = &state.scoop_path;
    let packages: Vec<ScoopPackage> = app_dirs
        .par_iter()
        .filter_map(|entry| {
            let path = entry.path();
            match load_package_details(&path, scoop_path) {
                Ok(package) => Some(package),
                Err(e) => {
                    log::warn!("Skipping package at '{}': {}", path.display(), e);
                    None
                }
            }
        })
        .collect();

    // Populate the cache
    *cache_guard = Some(packages.clone());

    log::info!("Found {} installed packages", packages.len());
    Ok(packages)
}

/// Invalidates the cached list of installed packages in AppState.
/// This should be called after operations that change the installed packages,
/// such as installing or uninstalling a package.
pub async fn invalidate_installed_cache(state: State<'_, AppState>) {
    let mut cache_guard = state.installed_packages.lock().await;
    *cache_guard = None;
    log::info!("Installed packages cache invalidated.");
}

/// Forces a refresh of the installed packages by invalidating cache and refetching.
#[tauri::command]
pub async fn refresh_installed_packages<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
) -> Result<Vec<ScoopPackage>, String> {
    // First invalidate the cache
    invalidate_installed_cache(state.clone()).await;
    // Then fetch fresh data
    get_installed_packages_full(app, state).await
}

/// Gets the installation path for a specific package.
#[tauri::command]
pub async fn get_package_path<R: Runtime>(
    _app: AppHandle<R>,
    state: State<'_, AppState>,
    package_name: String,
) -> Result<String, String> {
    let package_path = state.scoop_path.join("apps").join(&package_name);
    
    if !package_path.exists() {
        return Err(format!("Package '{}' is not installed", package_name));
    }
    
    Ok(package_path.to_string_lossy().to_string())
}

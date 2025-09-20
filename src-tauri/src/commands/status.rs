//! Command for checking the overall status of Scoop and installed packages.
//! This implements the equivalent of `scoop status` command.

use crate::commands::installed::get_installed_packages_full;
use crate::models::{AppStatusInfo, ScoopStatus, ScoopPackage as InstalledPackage};
use crate::state::AppState;
use crate::utils::locate_package_manifest;
use serde::{Deserialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Runtime, State};

/// Represents the structure of a `manifest.json` file, used to extract the version.
#[derive(Deserialize, Debug)]
struct Manifest {
    version: String,
    #[serde(default)]
    deprecated: Option<String>,
}

/// Represents the structure of an install.json file
#[derive(Deserialize, Debug)]
struct InstallInfo {
    #[serde(default)]
    hold: Option<bool>,
}

/// Check if a git repository needs updating by comparing local and remote branches.
fn test_update_status(repo_path: &Path) -> Result<bool, String> {
    if !repo_path.join(".git").exists() {
        return Ok(false); // If not a git repo, no updates needed (not an error condition)
    }

    // Check if git is available
    let git_check = Command::new("git")
        .arg("--version")
        .output();
    
    if git_check.is_err() {
        return Ok(false); // If git is not available, can't check for updates
    }

    // Fetch latest changes
    let fetch_result = Command::new("git")
        .args(&["fetch", "-q", "origin"])
        .current_dir(repo_path)
        .output();

    if fetch_result.is_err() {
        return Err("Network failure".to_string());
    }

    // Get current branch
    let branch_output = Command::new("git")
        .args(&["branch", "--show-current"])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("Failed to get current branch: {}", e))?;
    
    let branch = String::from_utf8_lossy(&branch_output.stdout).trim().to_string();
    
    if branch.is_empty() {
        return Ok(false); // No current branch, can't check for updates
    }
    
    // Check for commits ahead on origin
    let log_output = Command::new("git")
        .args(&["log", &format!("HEAD..origin/{}", branch), "--oneline"])
        .current_dir(repo_path)
        .output();

    match log_output {
        Ok(output) => Ok(!output.stdout.is_empty()),
        Err(_) => Ok(false), // If we can't check, assume no updates needed rather than failing
    }
}

/// Get the status of a single app
fn get_app_status(
    scoop_path: &Path,
    package: &InstalledPackage,
    held_packages: &HashSet<String>,
) -> Result<Option<AppStatusInfo>, String> {
    // Skip versioned installs entirely - they're intentionally locked to specific versions
    if package.is_versioned_install {
        return Ok(None);
    }

    let mut info = Vec::new();
    let mut is_failed = false;
    let mut is_deprecated = false;
    let mut is_removed = false;
    let mut latest_version = None;
    let mut is_outdated = false;
    let is_held = held_packages.contains(&package.name);

    if is_held {
        info.push("Held package".to_string());
    }

    // Check if manifest exists and get latest version
    match locate_package_manifest(scoop_path, &package.name, Some(package.source.clone())) {
        Ok((manifest_path, _)) => {
            match fs::read_to_string(manifest_path) {
                Ok(content) => {
                    match serde_json::from_str::<Manifest>(&content) {
                        Ok(manifest) => {
                            latest_version = Some(manifest.version.clone());
                            // Check if package is outdated
                            if package.version != manifest.version {
                                is_outdated = true;
                            }
                            if manifest.deprecated.is_some() {
                                is_deprecated = true;
                                info.push("Deprecated".to_string());
                            }
                        }
                        Err(_) => {
                            is_failed = true;
                            info.push("Install failed".to_string());
                        }
                    }
                }
                Err(_) => {
                    is_failed = true;
                    info.push("Install failed".to_string());
                }
            }
        }
        Err(_) => {
            is_removed = true;
            info.push("Manifest removed".to_string());
        }
    }

    // Check install info for additional status
    let install_info_path = scoop_path
        .join("apps")
        .join(&package.name)
        .join("current")
        .join("install.json");
    
    if install_info_path.exists() {
        if let Ok(content) = fs::read_to_string(install_info_path) {
            if let Ok(install_info) = serde_json::from_str::<InstallInfo>(&content) {
                if install_info.hold.unwrap_or(false) {
                    info.push("Held package".to_string());
                }
            }
        }
    }

    // Only return apps that have issues
    if !is_outdated && !is_failed && !is_deprecated && !is_removed {
        return Ok(None);
    }

    Ok(Some(AppStatusInfo {
        name: package.name.clone(),
        installed_version: package.version.clone(),
        latest_version,
        missing_dependencies: Vec::new(), // TODO: Implement dependency checking
        info,
        is_outdated,
        is_failed,
        is_held,
        is_deprecated,
        is_removed,
    }))
}

/// Get all local bucket directories
fn get_local_buckets(scoop_path: &Path) -> Vec<PathBuf> {
    let buckets_dir = scoop_path.join("buckets");
    let mut buckets = Vec::new();
    
    if let Ok(entries) = fs::read_dir(buckets_dir) {
        for entry in entries.flatten() {
            if entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
                buckets.push(entry.path());
            }
        }
    }
    
    buckets
}

/// Main command to check scoop status
#[tauri::command]
pub async fn check_scoop_status<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
) -> Result<ScoopStatus, String> {
    log::info!("Checking scoop status");

    let scoop_path = &state.scoop_path;
    let mut scoop_needs_update = false;
    let mut bucket_needs_update = false;
    let mut network_failure = false;

    // Check if scoop needs updating
    let scoop_current_dir = scoop_path.join("apps").join("scoop").join("current");
    if scoop_current_dir.exists() {
        match test_update_status(&scoop_current_dir) {
            Ok(needs_update) => scoop_needs_update = needs_update,
            Err(_) => network_failure = true,
        }
    }

    // Check if any buckets need updating
    if !network_failure {
        for bucket_path in get_local_buckets(scoop_path) {
            match test_update_status(&bucket_path) {
                Ok(needs_update) => {
                    if needs_update {
                        bucket_needs_update = true;
                        break;
                    }
                }
                Err(_) => {
                    network_failure = true;
                    break;
                }
            }
        }
    }

    // Get installed packages and check their status
    let installed_packages = get_installed_packages_full(app.clone(), state.clone()).await?;
    
    // Get held packages for efficient lookup
    let held_packages: HashSet<String> = 
        crate::commands::hold::list_held_packages(app, state.clone())
            .await?
            .into_iter()
            .collect();

    let mut apps_with_issues = Vec::new();

    for package in &installed_packages {
        // Skip scoop itself
        if package.name == "scoop" {
            continue;
        }

        if let Ok(Some(app_status)) = get_app_status(scoop_path, package, &held_packages) {
            apps_with_issues.push(app_status);
        }
    }

    let is_everything_ok = !scoop_needs_update 
        && !bucket_needs_update 
        && !network_failure 
        && apps_with_issues.is_empty();

    Ok(ScoopStatus {
        scoop_needs_update,
        bucket_needs_update,
        network_failure,
        apps_with_issues,
        is_everything_ok,
    })
}
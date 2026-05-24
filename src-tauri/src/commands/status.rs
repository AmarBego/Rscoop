//! Command for checking the overall status of Scoop and installed packages.
//! This implements the equivalent of `scoop status` command.

use crate::commands::installed::get_installed_packages_full;
use crate::models::{
    AppStatusInfo, PackageManifest, ScoopPackage as InstalledPackage, ScoopStatus,
};
use crate::state::AppState;
use crate::utils::locate_package_manifest;
use git2::Repository;
use serde::Deserialize;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Runtime, State};

/// Represents the structure of an install.json file
#[derive(Deserialize, Debug)]
struct InstallInfo {
    #[serde(default)]
    hold: Option<bool>,
}

/// Check whether a git repository is behind its already-fetched remote ref.
/// This is intentionally local-only: checking status must not fetch or mutate
/// repository state.
fn has_local_remote_update(repo_path: &Path) -> bool {
    if !repo_path.join(".git").exists() {
        return false;
    }

    // Open the repository using git2
    let repo = match Repository::open(repo_path) {
        Ok(repo) => repo,
        Err(_) => return false,
    };

    // Get the current branch
    let head = match repo.head() {
        Ok(head) => head,
        Err(_) => return false,
    };

    let branch_name = match head.shorthand() {
        Some(name) => name,
        None => return false,
    };

    let local_oid = match head.target() {
        Some(oid) => oid,
        None => return false,
    };

    let remote_branch_name = format!("origin/{}", branch_name);
    let remote_oid = match repo.find_branch(&remote_branch_name, git2::BranchType::Remote) {
        Ok(branch) => match branch.get().target() {
            Some(oid) => oid,
            None => return false,
        },
        Err(_) => return false,
    };

    local_oid != remote_oid
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
                    match serde_json::from_str::<PackageManifest>(&content) {
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

    let scoop_path = state.scoop_path();
    let mut scoop_needs_update = false;
    let mut bucket_needs_update = false;
    let network_failure = false;

    // Check if scoop needs updating
    let scoop_current_dir = scoop_path.join("apps").join("scoop").join("current");
    if scoop_current_dir.exists() {
        let dir_clone = scoop_current_dir.clone();
        if let Ok(needs_update) =
            tokio::task::spawn_blocking(move || has_local_remote_update(&dir_clone)).await
        {
            scoop_needs_update = needs_update;
        }
    }

    // Check if any buckets need updating
    let buckets = get_local_buckets(&scoop_path);
    let mut tasks = Vec::new();

    for bucket_path in buckets {
        tasks.push(tokio::task::spawn_blocking(move || {
            has_local_remote_update(&bucket_path)
        }));
    }

    for task in tasks {
        if let Ok(needs_update) = task.await {
            if needs_update {
                bucket_needs_update = true;
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

        if let Ok(Some(app_status)) = get_app_status(&scoop_path, package, &held_packages) {
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

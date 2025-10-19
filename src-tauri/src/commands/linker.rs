use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::State;
use tokio::time::{sleep, Duration};

#[cfg(windows)]
use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PackageVersion {
    pub version: String,
    pub is_current: bool,
    pub install_path: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct VersionedPackageInfo {
    pub name: String,
    pub current_version: String,
    pub available_versions: Vec<PackageVersion>,
}

/// Get all available versions for a package
#[tauri::command]
pub async fn get_package_versions(
    state: State<'_, AppState>,
    package_name: String,
    global: Option<bool>,
) -> Result<VersionedPackageInfo, String> {
    let scoop_path = state.scoop_path();
    let _is_global = global.unwrap_or(false);

    // Try to use cached versions first
    {
        let versions_guard = state.package_versions.lock().await;
        if let Some(cache) = versions_guard.as_ref() {
            // Check if the installed packages cache fingerprint matches
            let installed_guard = state.installed_packages.lock().await;
            if let Some(installed_cache) = installed_guard.as_ref() {
                if installed_cache.fingerprint == cache.fingerprint {
                    // Cache is still valid, use it
                    if let Some(version_dirs) = cache.versions_map.get(&package_name) {
                        log::debug!(
                            "Using cached versions for {}: {} versions",
                            package_name,
                            version_dirs.len()
                        );
                        // Rebuild package version info from cached data
                        return build_versioned_package_info(
                            &scoop_path,
                            &package_name,
                            version_dirs.clone(),
                        )
                        .await;
                    }
                }
            }
        }
    }

    // Cache miss or invalid - perform fresh scan
    log::debug!(
        "Cache miss or invalid for package versions, performing fresh scan for {}",
        package_name
    );

    let apps_dir = scoop_path.join("apps");
    let package_dir = apps_dir.join(&package_name);

    if !package_dir.exists() {
        return Err(format!("Package '{}' is not installed", package_name));
    }

    // List all version directories
    let mut version_dirs = Vec::new();

    if let Ok(entries) = fs::read_dir(&package_dir) {
        for entry in entries {
            if let Ok(entry) = entry {
                let path = entry.path();
                if path.is_dir() {
                    if let Some(dir_name) = path.file_name() {
                        let dir_name_str = dir_name.to_string_lossy().to_string();

                        // Skip "current" directory (it's a symlink)
                        if dir_name_str == "current" {
                            continue;
                        }

                        // Check if this looks like a version directory
                        if is_version_directory(&path) {
                            version_dirs.push(dir_name_str);
                        }
                    }
                }
            }
        }
    }

    // Update the cache
    {
        let mut versions_guard = state.package_versions.lock().await;
        if let Ok(installed_guard) = tokio::task::block_in_place(|| {
            tokio::runtime::Handle::current()
                .block_on(async { Ok::<_, ()>(state.installed_packages.lock().await) })
        }) {
            if let Some(installed_cache) = installed_guard.as_ref() {
                let mut map = std::collections::HashMap::new();
                map.insert(package_name.clone(), version_dirs.clone());
                *versions_guard = Some(crate::state::PackageVersionsCache {
                    fingerprint: installed_cache.fingerprint.clone(),
                    versions_map: map,
                });
            }
        }
    }

    log::info!(
        "Detected {} versions for: {}",
        version_dirs.len(),
        package_name
    );
    build_versioned_package_info(&scoop_path, &package_name, version_dirs).await
}

/// Helper function to build versioned package info from version directories
async fn build_versioned_package_info(
    scoop_path: &std::path::Path,
    package_name: &str,
    version_dirs: Vec<String>,
) -> Result<VersionedPackageInfo, String> {
    let package_dir = scoop_path.join("apps").join(package_name);

    // Get current version
    let current_link = package_dir.join("current");
    let current_version = if current_link.exists() {
        match fs::read_link(&current_link) {
            Ok(target) => {
                let resolved_target = if target.is_absolute() {
                    target.clone()
                } else {
                    package_dir.join(&target)
                };
                resolved_target
                    .file_name()
                    .map(|v| v.to_string_lossy().to_string())
                    .unwrap_or_default()
            }
            Err(_) => String::new(),
        }
    } else {
        String::new()
    };

    // Build version info
    let mut versions = Vec::new();
    for dir_name_str in version_dirs {
        let is_current = dir_name_str == current_version;
        let path = package_dir.join(&dir_name_str);
        versions.push(PackageVersion {
            version: dir_name_str,
            is_current,
            install_path: path.to_string_lossy().to_string(),
        });
    }

    // Sort versions (newest first, with current version prioritized)
    versions.sort_by(|a, b| {
        if a.is_current {
            std::cmp::Ordering::Less
        } else if b.is_current {
            std::cmp::Ordering::Greater
        } else {
            b.version.cmp(&a.version)
        }
    });

    Ok(VersionedPackageInfo {
        name: package_name.to_string(),
        current_version,
        available_versions: versions,
    })
}

/// Switch to a different version of an installed package
#[tauri::command]
pub async fn switch_package_version(
    state: State<'_, AppState>,
    package_name: String,
    target_version: String,
    global: Option<bool>,
) -> Result<String, String> {
    let scoop_path = state.scoop_path();
    let is_global = global.unwrap_or(false);

    // Determine the apps directory based on global flag
    let apps_dir = if is_global {
        scoop_path.join("apps")
    } else {
        scoop_path.join("apps")
    };

    let package_dir = apps_dir.join(&package_name);
    let target_version_dir = package_dir.join(&target_version);
    let current_link = package_dir.join("current");

    // Validate that the package exists
    if !package_dir.exists() {
        return Err(format!("Package '{}' is not installed", package_name));
    }

    // Validate that the target version exists
    if !target_version_dir.exists() {
        return Err(format!(
            "Version '{}' of package '{}' is not installed",
            target_version, package_name
        ));
    }

    // Use direct Windows API calls to handle junction operations
    let result = switch_junction_direct(&current_link, &target_version_dir).await;
    if let Err(e) = result {
        return Err(format!("Failed to switch version junction: {}", e));
    }

    Ok(format!(
        "Successfully switched '{}' to version '{}'",
        package_name, target_version
    ))
}

/// Use direct Windows commands to switch junctions efficiently
async fn switch_junction_direct(current_link: &Path, target_dir: &Path) -> Result<(), String> {
    // Remove existing junction if it exists
    if current_link.exists() {
        remove_junction(current_link).await?;
    }

    // Create new junction
    create_junction(current_link, target_dir).await?;

    Ok(())
}

/// Remove a directory junction using multiple methods
async fn remove_junction(junction_path: &Path) -> Result<(), String> {
    let junction_str = junction_path.to_string_lossy().replace('/', "\\");

    // First check if the path exists
    if !junction_path.exists() {
        log::info!(
            "Junction {} does not exist, nothing to remove",
            junction_str
        );
        return Ok(());
    }

    // Check if any processes might be using the directory
    log::info!("Attempting to remove junction: {}", junction_str);

    #[cfg(windows)]
    {
        // Method 1: Try using rmdir /s (more aggressive)
        let mut cmd = Command::new("cmd");
        cmd.args(["/c", "rmdir", "/s", "/q", &junction_str]);
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW

        match cmd.output() {
            Ok(output) => {
                if output.status.success() {
                    log::info!(
                        "Successfully removed junction with rmdir /s: {}",
                        junction_str
                    );
                    return Ok(());
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    log::warn!("rmdir /s failed: {}", stderr);
                }
            }
            Err(e) => {
                log::warn!("Failed to execute rmdir /s: {}", e);
            }
        }

        // Small delay to allow any file handles to close
        sleep(Duration::from_millis(100)).await;

        // Method 2: Try PowerShell Remove-Item with Force
        let mut cmd = Command::new("powershell");
        cmd.args([
            "-NoProfile",
            "-Command",
            &format!(
                "Remove-Item '{}' -Force -Recurse -ErrorAction SilentlyContinue",
                junction_str
            ),
        ]);
        cmd.creation_flags(0x0800_0000);

        match cmd.output() {
            Ok(output) => {
                if output.status.success() {
                    log::info!(
                        "Successfully removed junction with PowerShell: {}",
                        junction_str
                    );
                    return Ok(());
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    log::warn!("PowerShell Remove-Item failed: {}", stderr);
                }
            }
            Err(e) => {
                log::warn!("Failed to execute PowerShell: {}", e);
            }
        }

        // Method 3: Try regular rmdir without /s
        let mut cmd = Command::new("cmd");
        cmd.args(["/c", "rmdir", "/q", &junction_str]);
        cmd.creation_flags(0x0800_0000);

        match cmd.output() {
            Ok(output) => {
                if output.status.success() {
                    log::info!("Successfully removed junction with rmdir: {}", junction_str);
                    return Ok(());
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    log::warn!("rmdir failed: {}", stderr);
                }
            }
            Err(e) => {
                log::warn!("Failed to execute rmdir: {}", e);
            }
        }

        // Method 4: Final fallback with Rust's fs::remove_dir
        match fs::remove_dir(junction_path) {
            Ok(()) => {
                log::info!(
                    "Successfully removed junction with fs::remove_dir: {}",
                    junction_str
                );
                Ok(())
            }
            Err(e) => {
                log::error!("All junction removal methods failed. Last error: {}", e);
                Err(format!(
                    "Failed to remove junction '{}'. This may be due to:\n\
                    1. Insufficient permissions (try running as administrator)\n\
                    2. The directory is in use by another process\n\
                    3. Antivirus software blocking the operation\n\
                    Error: {}",
                    junction_str, e
                ))
            }
        }
    }
}

/// Create a directory junction using Windows mklink command
async fn create_junction(junction_path: &Path, target_path: &Path) -> Result<(), String> {
    let junction_str = junction_path.to_string_lossy().replace('/', "\\");
    let target_str = target_path.to_string_lossy().replace('/', "\\");

    #[cfg(windows)]
    {
        let mut cmd = Command::new("cmd");
        cmd.args(["/c", "mklink", "/J", &junction_str, &target_str]);
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW

        match cmd.output() {
            Ok(output) => {
                if output.status.success() {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    log::info!(
                        "Successfully created junction: {} -> {} (output: {})",
                        junction_str,
                        target_str,
                        stdout.trim()
                    );
                    Ok(())
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    Err(format!("Failed to create junction: {}", stderr))
                }
            }
            Err(e) => Err(format!("Failed to execute mklink command: {}", e)),
        }
    }
}

/// Check if a directory looks like a version directory
fn is_version_directory(path: &Path) -> bool {
    // Check if it contains typical scoop installation files
    let manifest_file = path.join("manifest.json");
    let install_json = path.join("install.json");

    manifest_file.exists() || install_json.exists()
}

/// Get packages that have multiple versions installed
#[tauri::command]
pub async fn get_versioned_packages(
    state: State<'_, AppState>,
    global: Option<bool>,
) -> Result<Vec<String>, String> {
    let scoop_path = state.scoop_path();
    let _is_global = global.unwrap_or(false);

    let apps_dir = scoop_path.join("apps");

    // Try to use cached versions if available
    {
        let versions_guard = state.package_versions.lock().await;
        if let Some(cache) = versions_guard.as_ref() {
            // Check if the installed packages cache fingerprint matches
            let installed_guard = state.installed_packages.lock().await;
            if let Some(installed_cache) = installed_guard.as_ref() {
                if installed_cache.fingerprint == cache.fingerprint {
                    // Cache is valid, use it to find versioned packages
                    let versioned: Vec<String> = cache
                        .versions_map
                        .iter()
                        .filter(|(_, versions)| versions.len() > 1)
                        .map(|(name, _)| name.clone())
                        .collect();

                    log::debug!(
                        "Using cached versions to find versioned packages: {} found",
                        versioned.len()
                    );
                    return Ok(versioned);
                }
            }
        }
    }

    // Cache miss - scan directories to find versioned packages
    log::debug!("Cache miss for versioned packages, performing fresh scan");
    let mut versioned_packages = Vec::new();

    if let Ok(entries) = fs::read_dir(&apps_dir) {
        for entry in entries {
            if let Ok(entry) = entry {
                let package_path = entry.path();
                if package_path.is_dir() {
                    if let Some(package_name) = package_path.file_name() {
                        let package_name_str = package_name.to_string_lossy().to_string();

                        // Count version directories (excluding "current")
                        let mut version_dirs = Vec::new();
                        if let Ok(package_entries) = fs::read_dir(&package_path) {
                            for package_entry in package_entries {
                                if let Ok(package_entry) = package_entry {
                                    let path = package_entry.path();
                                    if path.is_dir() {
                                        let dir_name = path.file_name().unwrap().to_string_lossy();
                                        if dir_name != "current" && is_version_directory(&path) {
                                            version_dirs.push(dir_name.to_string());
                                        }
                                    }
                                }
                            }
                        }

                        // If more than one version is installed, it's a versioned package
                        if version_dirs.len() > 1 {
                            versioned_packages.push(package_name_str.clone());

                            // Update the cache with this package's versions
                            let mut versions_guard = state.package_versions.lock().await;
                            if let Ok(installed_guard) = tokio::task::block_in_place(|| {
                                tokio::runtime::Handle::current().block_on(async {
                                    Ok::<_, ()>(state.installed_packages.lock().await)
                                })
                            }) {
                                if let Some(installed_cache) = installed_guard.as_ref() {
                                    if versions_guard.is_none() {
                                        *versions_guard =
                                            Some(crate::state::PackageVersionsCache {
                                                fingerprint: installed_cache.fingerprint.clone(),
                                                versions_map: std::collections::HashMap::new(),
                                            });
                                    }
                                    if let Some(cache) = versions_guard.as_mut() {
                                        cache.versions_map.insert(package_name_str, version_dirs);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    versioned_packages.sort();
    log::info!(
        "Programs detected with multiple versions: {}",
        versioned_packages.len()
    );
    Ok(versioned_packages)
}

/// Debug command to inspect package directory structure
#[tauri::command]
pub async fn debug_package_structure(
    state: State<'_, AppState>,
    package_name: String,
    global: Option<bool>,
) -> Result<String, String> {
    let scoop_path = state.scoop_path();
    let is_global = global.unwrap_or(false);

    let apps_dir = if is_global {
        scoop_path.join("apps")
    } else {
        scoop_path.join("apps")
    };

    let package_dir = apps_dir.join(&package_name);

    if !package_dir.exists() {
        return Err(format!("Package '{}' is not installed", package_name));
    }

    let mut debug_info = Vec::new();
    debug_info.push(format!("Package directory: {}", package_dir.display()));

    // Check current symlink
    let current_link = package_dir.join("current");
    if current_link.exists() {
        match fs::read_link(&current_link) {
            Ok(target) => {
                debug_info.push(format!("Current symlink target: {:?}", target));

                let resolved_target = if target.is_absolute() {
                    target.clone()
                } else {
                    package_dir.join(&target)
                };
                debug_info.push(format!("Resolved target: {}", resolved_target.display()));

                if let Some(version) = resolved_target.file_name() {
                    debug_info.push(format!(
                        "Detected current version: {}",
                        version.to_string_lossy()
                    ));
                }
            }
            Err(e) => debug_info.push(format!("Error reading symlink: {}", e)),
        }
    } else {
        debug_info.push("No current symlink found".to_string());
    }

    // List all directories
    debug_info.push("\nDirectory contents:".to_string());
    if let Ok(entries) = fs::read_dir(&package_dir) {
        for entry in entries {
            if let Ok(entry) = entry {
                let path = entry.path();
                if let Some(name) = path.file_name() {
                    let name_str = name.to_string_lossy();
                    if path.is_dir() {
                        let is_version = is_version_directory(&path);
                        debug_info
                            .push(format!("  DIR: {} (version_dir: {})", name_str, is_version));
                    } else {
                        debug_info.push(format!("  FILE: {}", name_str));
                    }
                }
            }
        }
    }

    Ok(debug_info.join("\n"))
}

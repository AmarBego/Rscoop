//! Command for fetching all installed Scoop packages from the filesystem.
use crate::models::ScoopPackage;
use crate::state::{AppState, InstalledPackagesCache};
use chrono::{DateTime, Utc};
use rayon::prelude::*;
use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
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
                let manifest_path = bucket_entry
                    .path()
                    .join("bucket")
                    .join(format!("{}.json", package_name));

                if manifest_path.exists() {
                    return Some(bucket_name);
                }
            }
        }
    }

    // Fallback: check if it's in the main bucket (which might not be in buckets dir)
    None
}

/// Returns the most recently updated version directory for a package when the
/// `current` link is missing.
fn find_latest_version_dir(package_path: &Path) -> Option<PathBuf> {
    let mut candidates: Vec<(u128, PathBuf)> = Vec::new();

    if let Ok(entries) = fs::read_dir(package_path) {
        for entry in entries.flatten() {
            let path = entry.path();

            if !path.is_dir() {
                continue;
            }

            if path
                .file_name()
                .and_then(|name| name.to_str())
                .map(|name| name.eq_ignore_ascii_case("current"))
                .unwrap_or(false)
            {
                continue;
            }

            let install_manifest = path.join("install.json");
            let manifest_path = path.join("manifest.json");

            if !install_manifest.exists() && !manifest_path.exists() {
                continue;
            }

            let modified = fs::metadata(&install_manifest)
                .or_else(|_| fs::metadata(&manifest_path))
                .or_else(|_| fs::metadata(&path))
                .and_then(|meta| meta.modified())
                .ok()
                .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                .map(|duration| duration.as_millis())
                .unwrap_or(0);

            candidates.push((modified, path));
        }
    }

    candidates.sort_by(|a, b| b.0.cmp(&a.0));
    candidates.into_iter().map(|(_, path)| path).next()
}

fn locate_install_dir(package_path: &Path) -> Option<PathBuf> {
    let current_path = package_path.join("current");

    if current_path.is_dir() {
        Some(current_path)
    } else {
        find_latest_version_dir(package_path)
    }
}

fn compute_apps_fingerprint(app_dirs: &[PathBuf]) -> String {
    let mut entries = Vec::with_capacity(app_dirs.len());

    for path in app_dirs {
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            let modified_stamp = locate_install_dir(path)
                .and_then(|install_dir| {
                    let install_manifest = install_dir.join("install.json");
                    let manifest_path = install_dir.join("manifest.json");

                    fs::metadata(&install_manifest)
                        .or_else(|_| fs::metadata(&manifest_path))
                        .or_else(|_| fs::metadata(&install_dir))
                        .and_then(|meta| meta.modified())
                        .ok()
                        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                        .map(|duration| duration.as_millis())
                })
                .or_else(|| {
                    fs::metadata(path)
                        .and_then(|meta| meta.modified())
                        .ok()
                        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                        .map(|duration| duration.as_millis())
                })
                .unwrap_or(0);

            entries.push(format!("{}:{}", name.to_ascii_lowercase(), modified_stamp));
        }
    }

    entries.sort();
    format!("{}|{}", app_dirs.len(), entries.join(";"))
}

/// Loads the details for a single installed package from its directory.
/// Uses quick synchronous checks without blocking retries; the frontend handles
/// refresh after cold-start if any packages are not yet ready on fresh .msi installs.
fn load_package_details(package_path: &Path, scoop_path: &Path) -> Result<ScoopPackage, String> {
    let package_name = package_path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| format!("Invalid package directory name: {:?}", package_path))?
        .to_string();

    let current_path = package_path.join("current");

    let install_root = if current_path.is_dir() {
        current_path.clone()
    } else if let Some(fallback_dir) = find_latest_version_dir(package_path) {
        log::info!(
            "=== INSTALLED SCAN === 'current' missing for {}; using latest version directory '{}'",
            package_name,
            fallback_dir.display(),
        );
        fallback_dir
    } else {
        return Err(format!(
            "'current' directory not found for {} and no version directories available",
            package_name
        ));
    };

    // Read and parse manifest.json
    let manifest_path = install_root.join("manifest.json");
    let manifest_content = fs::read_to_string(&manifest_path)
        .map_err(|e| format!("Failed to read manifest.json for {}: {}", package_name, e))?;
    let manifest: Manifest = serde_json::from_str(&manifest_content)
        .map_err(|e| format!("Failed to parse manifest.json for {}: {}", package_name, e))?;

    // Read and parse install.json
    let install_manifest_path = install_root.join("install.json");
    let install_manifest_content = fs::read_to_string(&install_manifest_path)
        .map_err(|e| format!("Failed to read install.json for {}: {}", package_name, e))?;
    let install_manifest: InstallManifest = serde_json::from_str(&install_manifest_content)
        .map_err(|e| format!("Failed to parse install.json for {}: {}", package_name, e))?;

    // Determine bucket - either from install.json or by searching buckets
    let bucket = install_manifest
        .bucket
        .clone()
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
async fn refresh_scoop_path_if_needed<R: Runtime>(
    app: AppHandle<R>,
    state: &AppState,
    reason: &str,
) -> Option<PathBuf> {
    let current_path = state.scoop_path();

    match crate::utils::resolve_scoop_root(app) {
        Ok(new_path) => {
            if current_path != new_path {
                log::info!(
                    "Scoop path updated from '{}' to '{}' ({})",
                    current_path.display(),
                    new_path.display(),
                    reason
                );
                state.set_scoop_path(new_path.clone());
                let mut cache_guard = state.installed_packages.lock().await;
                *cache_guard = None;
                return Some(new_path);
            }
            Some(current_path)
        }
        Err(err) => {
            log::warn!("Failed to refresh Scoop path ({}): {}", reason, err);
            None
        }
    }
}

/// Internal method to perform the actual installed packages scan.
/// Separated from the public command to support both warm-up and user-initiated refresh paths.
async fn scan_installed_packages_internal<R: Runtime>(
    app: AppHandle<R>,
    state: &AppState,
    is_warmup: bool,
) -> Result<Vec<ScoopPackage>, String> {
    let mut scoop_path = state.scoop_path();
    let log_prefix = if is_warmup {
        "=== INSTALLED WARMUP ==="
    } else {
        "=== INSTALLED SCAN ==="
    };

    log::info!("{} Starting installed packages scan", log_prefix);
    log::info!(
        "{} Current Scoop path: {}",
        log_prefix,
        scoop_path.display()
    );

    let mut apps_path = scoop_path.join("apps");

    if !apps_path.is_dir() {
        log::warn!(
            "{} ✗ Scoop apps directory does not exist at: {}",
            log_prefix,
            apps_path.display()
        );

        if let Some(updated_path) =
            refresh_scoop_path_if_needed(app.clone(), &state, "apps path missing").await
        {
            scoop_path = updated_path;
            apps_path = scoop_path.join("apps");
            log::info!("{} Path refreshed to: {}", log_prefix, apps_path.display());
        }
    }

    if !apps_path.is_dir() {
        log::warn!(
            "{} ✗ Scoop apps directory still not found after refresh at: {}",
            log_prefix,
            apps_path.display()
        );
        let mut cache_guard = state.installed_packages.lock().await;
        *cache_guard = None;
        return Ok(vec![]);
    }

    log::info!(
        "{} ✓ Apps directory found: {}",
        log_prefix,
        apps_path.display()
    );

    let app_dirs: Vec<PathBuf> = fs::read_dir(&apps_path)
        .map_err(|e| format!("Failed to read apps directory: {}", e))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_dir())
        .collect();

    log::info!(
        "{} Found {} app directories in apps path",
        log_prefix,
        app_dirs.len()
    );

    let fingerprint = compute_apps_fingerprint(&app_dirs);
    log::info!("{} Computed fingerprint: {}", log_prefix, fingerprint);

    {
        let cache_guard = state.installed_packages.lock().await;
        if let Some(cache) = cache_guard.as_ref() {
            if cache.fingerprint == fingerprint {
                log::info!(
                    "{} ✓ Cache HIT - returning {} cached packages",
                    log_prefix,
                    cache.packages.len()
                );
                return Ok(cache.packages.clone());
            } else {
                log::info!(
                    "{} Cache fingerprint mismatch. Old: {}, New: {}",
                    log_prefix,
                    cache.fingerprint,
                    fingerprint
                );
            }
        } else {
            log::info!("{} Cache MISS - no cached data found", log_prefix);
        }
    }

    log::info!(
        "{} Scanning {} installed package directories from filesystem",
        log_prefix,
        app_dirs.len()
    );

    let packages: Vec<ScoopPackage> = app_dirs
        .par_iter()
        .filter_map(
            |path| match load_package_details(path.as_path(), &scoop_path) {
                Ok(package) => Some(package),
                Err(e) => {
                    log::warn!(
                        "{} Skipping package at '{}': {}",
                        log_prefix,
                        path.display(),
                        e
                    );
                    None
                }
            },
        )
        .collect();

    log::info!(
        "{} ✓ Scanned {} packages, found {} valid packages",
        log_prefix,
        app_dirs.len(),
        packages.len()
    );

    {
        let mut cache_guard = state.installed_packages.lock().await;
        *cache_guard = Some(InstalledPackagesCache {
            packages: packages.clone(),
            fingerprint: fingerprint.clone(),
        });
        log::info!(
            "{} ✓ Cache updated with {} packages at fingerprint: {}",
            log_prefix,
            packages.len(),
            fingerprint
        );
    }

    log::info!(
        "{} ✓ Returning {} installed packages",
        log_prefix,
        packages.len()
    );
    Ok(packages)
}

#[tauri::command]
pub async fn get_installed_packages_full<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
) -> Result<Vec<ScoopPackage>, String> {
    log::info!("=== INSTALLED SCAN === get_installed_packages_full called");

    // Perform the scan (cache is checked inside)
    scan_installed_packages_internal(app, &state, false).await
}

/// Warms up the installed packages cache during cold start.
/// Performs an initial scan without debouncing and logs at warmup level.
/// This is separate from user-initiated refresh to reduce log noise.
pub async fn warmup_installed_packages<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
) -> Result<Vec<ScoopPackage>, String> {
    log::info!("=== INSTALLED WARMUP === Starting warmup scan");
    state.update_refresh_time();
    scan_installed_packages_internal(app, &state, true).await
}

/// Invalidates the cached list of installed packages in AppState.
/// This should be called after operations that change the installed packages,
/// such as installing or uninstalling a package.
pub async fn invalidate_installed_cache(state: State<'_, AppState>) {
    let mut cache_guard = state.installed_packages.lock().await;
    let was_cached = cache_guard.is_some();
    *cache_guard = None;

    // Also invalidate the versions cache since it depends on installed packages
    let mut versions_guard = state.package_versions.lock().await;
    *versions_guard = None;

    log::info!(
        "=== INSTALLED CACHE === Cache invalidated (was_cached: {}). Also invalidated versions cache.",
        was_cached
    );
}

/// Forces a refresh of the installed packages by invalidating cache and refetching.
/// Debounces rapid consecutive calls to prevent unnecessary scans.
#[tauri::command]
pub async fn refresh_installed_packages<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
) -> Result<Vec<ScoopPackage>, String> {
    log::info!("=== INSTALLED REFRESH === refresh_installed_packages called");

    // Check if we should debounce this refresh call
    if state.should_debounce_refresh() {
        log::debug!(
            "=== INSTALLED REFRESH === Debouncing refresh (less than 1 second since last refresh)"
        );
        // Return cached results without rescanning
        let cache_guard = state.installed_packages.lock().await;
        if let Some(cache) = cache_guard.as_ref() {
            log::info!("=== INSTALLED REFRESH === Returning cached packages due to debounce");
            return Ok(cache.packages.clone());
        }
    }

    state.update_refresh_time();

    // First invalidate the cache
    log::info!("=== INSTALLED REFRESH === Invalidating cache");
    invalidate_installed_cache(state.clone()).await;

    // Then fetch fresh data
    log::info!("=== INSTALLED REFRESH === Fetching fresh data");
    scan_installed_packages_internal(app, &state, false).await
}

/// Gets the installation path for a specific package.
#[tauri::command]
pub async fn get_package_path<R: Runtime>(
    _app: AppHandle<R>,
    state: State<'_, AppState>,
    package_name: String,
) -> Result<String, String> {
    let package_path = state.scoop_path().join("apps").join(&package_name);

    if !package_path.exists() {
        return Err(format!("Package '{}' is not installed", package_name));
    }

    Ok(package_path.to_string_lossy().to_string())
}

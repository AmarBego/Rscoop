//! Commands for managing the Scoop cache.
use crate::commands::installed::get_installed_packages_full;
use crate::state::AppState;
use rayon::prelude::*;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;
use tauri::{AppHandle, Manager, Runtime, State};

/// Represents a single entry in the Scoop cache.
#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CacheEntry {
    pub name: String,
    pub version: String,
    pub length: u64,
    pub file_name: String,
    pub is_versioned_install: bool,
    pub is_safe_to_delete: bool,
}

#[derive(Debug, Clone)]
pub struct CacheClearResult {
    pub deleted: Vec<String>,
    pub failed: Vec<(String, String)>,
}

/// Parses a `CacheEntry` from a given file path.
///
/// The file name is expected to be in the format `name#version#hash.ext`.
fn parse_cache_entry_from_path(
    path: &Path,
    versioned_packages: &HashSet<String>,
) -> Option<CacheEntry> {
    let file_name = path.file_name()?.to_str()?.to_string();

    let parts: Vec<&str> = file_name.split('#').collect();
    if parts.len() < 2 {
        log::warn!("Skipping cache file with unexpected format: {}", file_name);
        return None;
    }

    let metadata = fs::metadata(path).ok()?;
    if !metadata.is_file() {
        return None;
    }

    let package_name = parts[0].to_string();
    let is_versioned_install = versioned_packages.contains(&package_name);

    Some(CacheEntry {
        name: package_name,
        version: parts[1].to_string(),
        length: metadata.len(),
        file_name,
        is_versioned_install,
        is_safe_to_delete: !is_versioned_install,
    })
}

/// Lists all entries in the Scoop cache directory with version-awareness.
///
/// This function reads the cache directory, parses each file to extract cache information,
/// and returns a sorted list of cache entries with safety information.
#[tauri::command]
pub async fn list_cache_contents<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
) -> Result<Vec<CacheEntry>, String> {
    log::info!("Listing cache contents from filesystem with version-awareness");

    let scoop_path = state.scoop_path();
    let cache_path = scoop_path.join("cache");

    if !cache_path.is_dir() {
        log::warn!("Scoop cache directory not found at: {:?}", cache_path);
        return Ok(vec![]);
    }

    // Get all installed packages to identify versioned installs
    let installed_packages = get_installed_packages_full(app, state).await?;
    let versioned_packages: HashSet<String> = installed_packages
        .iter()
        .filter(|pkg| pkg.is_versioned_install)
        .map(|pkg| pkg.name.clone())
        .collect();

    let read_dir =
        fs::read_dir(&cache_path).map_err(|e| format!("Failed to read cache directory: {}", e))?;

    let mut entries: Vec<CacheEntry> = read_dir
        .par_bridge()
        .filter_map(Result::ok)
        .filter_map(|entry| parse_cache_entry_from_path(&entry.path(), &versioned_packages))
        .collect();

    entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    log::info!(
        "Found {} cache entries, {} are versioned installs",
        entries.len(),
        entries.iter().filter(|e| e.is_versioned_install).count()
    );

    Ok(entries)
}

/// Clears specified files or the entire Scoop cache, with version-awareness.
///
/// # Arguments
/// * `files` - An optional vector of file names to remove. If `None`, only non-versioned cache is cleared.
#[tauri::command]
pub async fn clear_cache<R: Runtime>(
    app: AppHandle<R>,
    _state: State<'_, AppState>,
    files: Option<Vec<String>>,
) -> Result<(), String> {
    log::info!(
        "Clearing cache from filesystem with version-awareness. Files: {:?}",
        &files
    );

    clear_cache_internal(app, files).await.map(|_| ())
}

pub async fn clear_cache_internal<R: Runtime>(
    app: AppHandle<R>,
    files: Option<Vec<String>>,
) -> Result<CacheClearResult, String> {
    let state_app = app.clone();
    let state = state_app.state::<AppState>();
    let scoop_path = state.scoop_path();
    let cache_path = scoop_path.join("cache");
    if !cache_path.is_dir() {
        return Ok(CacheClearResult {
            deleted: vec![],
            failed: vec![],
        });
    }

    let installed_packages = get_installed_packages_full(app, state).await?;
    let versioned_packages: HashSet<String> = installed_packages
        .iter()
        .filter(|pkg| pkg.is_versioned_install)
        .map(|pkg| pkg.name.clone())
        .collect();

    let files_to_delete = match files {
        Some(files) if !files.is_empty() => files,
        _ => fs::read_dir(&cache_path)
            .map_err(|e| format!("Failed to read cache directory: {}", e))?
            .filter_map(Result::ok)
            .filter_map(|entry| entry.file_name().to_str().map(ToOwned::to_owned))
            .collect(),
    };

    clear_specific_files_safe(&cache_path, &files_to_delete, &versioned_packages)
}

pub async fn cleanup_outdated_cache_for_packages_internal<R: Runtime>(
    app: AppHandle<R>,
    packages: Option<&[String]>,
) -> Result<CacheClearResult, String> {
    let state_app = app.clone();
    let state = state_app.state::<AppState>();
    let scoop_path = state.scoop_path();
    let cache_path = scoop_path.join("cache");
    if !cache_path.is_dir() {
        return Ok(CacheClearResult {
            deleted: vec![],
            failed: vec![],
        });
    }

    let installed_packages = get_installed_packages_full(app, state).await?;
    let installed_versions: HashMap<String, String> = installed_packages
        .iter()
        .map(|pkg| (pkg.name.to_ascii_lowercase(), pkg.version.clone()))
        .collect();
    let versioned_packages: HashSet<String> = installed_packages
        .iter()
        .filter(|pkg| pkg.is_versioned_install)
        .map(|pkg| pkg.name.clone())
        .collect();
    let requested_packages: Option<HashSet<String>> =
        packages.map(|names| names.iter().map(|name| name.to_ascii_lowercase()).collect());

    let files_to_delete: Vec<String> = fs::read_dir(&cache_path)
        .map_err(|e| format!("Failed to read cache directory: {}", e))?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            let cache_entry = parse_cache_entry_from_path(&path, &versioned_packages)?;
            let normalized_name = cache_entry.name.to_ascii_lowercase();
            if requested_packages
                .as_ref()
                .is_some_and(|packages| !packages.contains(&normalized_name))
            {
                return None;
            }
            let installed_version = installed_versions.get(&normalized_name);
            let is_outdated = match installed_version {
                Some(version) => cache_entry.version != *version,
                None => true,
            };
            is_outdated.then_some(cache_entry.file_name)
        })
        .collect();

    clear_specific_files_safe(&cache_path, &files_to_delete, &versioned_packages)
}

fn clear_specific_files_safe(
    cache_path: &Path,
    files_to_delete: &[String],
    versioned_packages: &HashSet<String>,
) -> Result<CacheClearResult, String> {
    log::info!(
        "Clearing {} specified cache files (avoiding versioned installs).",
        files_to_delete.len()
    );

    let results: Vec<(String, Result<(), String>)> = files_to_delete
        .par_iter()
        .map(|file_name| {
            // Parse the package name from the cache file name (format: name#version#hash.ext)
            if let Some(package_name) = file_name.split('#').next() {
                if versioned_packages.contains(package_name) {
                    log::info!("Skipping cache file for versioned install: {}", file_name);
                    return (file_name.clone(), Err("versioned install".to_string()));
                }
            }

            let file_path = cache_path.join(file_name);
            if file_path.is_file() {
                match fs::remove_file(&file_path) {
                    Ok(()) => {
                        log::debug!("Deleted cache file: {}", file_name);
                        (file_name.clone(), Ok(()))
                    }
                    Err(e) => {
                        log::error!("Failed to delete cache file {}: {}", file_name, e);
                        (file_name.clone(), Err(e.to_string()))
                    }
                }
            } else {
                (file_name.clone(), Err("not a file".to_string()))
            }
        })
        .collect();

    let mut deleted = Vec::new();
    let mut failed = Vec::new();
    for (file, result) in results {
        match result {
            Ok(()) => deleted.push(file),
            Err(reason) if reason == "versioned install" => {}
            Err(reason) => failed.push((file, reason)),
        }
    }

    Ok(CacheClearResult { deleted, failed })
}

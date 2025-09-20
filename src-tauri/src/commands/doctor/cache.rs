//! Commands for managing the Scoop cache.
use crate::utils;
use crate::commands::installed::get_installed_packages_full;
use crate::state::AppState;
use rayon::prelude::*;
use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use tauri::{AppHandle, Runtime, State};

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

/// Parses a `CacheEntry` from a given file path.
///
/// The file name is expected to be in the format `name#version#hash.ext`.
fn parse_cache_entry_from_path(
    path: &Path, 
    versioned_packages: &HashSet<String>
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

    let cache_path = utils::resolve_scoop_root(app.clone())?.join("cache");

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
    state: State<'_, AppState>,
    files: Option<Vec<String>>,
) -> Result<(), String> {
    log::info!("Clearing cache from filesystem with version-awareness. Files: {:?}", &files);

    let cache_path = utils::resolve_scoop_root(app.clone())?.join("cache");

    if !cache_path.is_dir() {
        return Ok(());
    }

    // Get versioned packages to avoid deleting their cache
    let installed_packages = get_installed_packages_full(app, state).await?;
    let versioned_packages: HashSet<String> = installed_packages
        .iter()
        .filter(|pkg| pkg.is_versioned_install)
        .map(|pkg| pkg.name.clone())
        .collect();

    match files {
        Some(files_to_delete) if !files_to_delete.is_empty() => {
            clear_specific_files_safe(&cache_path, &files_to_delete, &versioned_packages)
        }
        _ => clear_safe_cache(&cache_path, &versioned_packages),
    }
}

/// Removes a specific list of files from the cache directory, avoiding versioned installs.
fn clear_specific_files_safe(
    cache_path: &Path, 
    files_to_delete: &[String], 
    versioned_packages: &HashSet<String>
) -> Result<(), String> {
    log::info!("Clearing {} specified cache files (avoiding versioned installs).", files_to_delete.len());

    files_to_delete.par_iter().for_each(|file_name| {
        // Parse the package name from the cache file name (format: name#version#hash.ext)
        if let Some(package_name) = file_name.split('#').next() {
            if versioned_packages.contains(package_name) {
                log::info!("Skipping cache file for versioned install: {}", file_name);
                return; // Skip this file
            }
        }

        let file_path = cache_path.join(file_name);
        if file_path.is_file() {
            match fs::remove_file(&file_path) {
                Ok(()) => {
                    log::debug!("Deleted cache file: {}", file_name);
                }
                Err(e) => {
                    log::error!("Failed to delete cache file {}: {}", file_name, e);
                }
            }
        }
    });

    Ok(())
}

/// Removes all non-versioned files from the cache directory.
fn clear_safe_cache(cache_path: &Path, versioned_packages: &HashSet<String>) -> Result<(), String> {
    log::info!("Clearing cache directory (avoiding versioned installs).");

    let dir_entries =
        fs::read_dir(cache_path).map_err(|e| format!("Failed to read cache directory: {}", e))?;

    dir_entries
        .par_bridge()
        .filter_map(Result::ok)
        .for_each(|entry| {
            let path = entry.path();
            if path.is_file() {
                if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                    // Parse the package name from the cache file name
                    if let Some(package_name) = file_name.split('#').next() {
                        if versioned_packages.contains(package_name) {
                            log::debug!("Skipping cache file for versioned install: {}", file_name);
                            return; // Skip this file
                        }
                    }
                }

                match fs::remove_file(&path) {
                    Ok(()) => {
                        log::debug!("Deleted cache file: {:?}", path.file_name());
                    }
                    Err(e) => {
                        log::error!("Failed to remove cache file {:?}: {}", path.file_name(), e);
                    }
                }
            }
        });

    Ok(())
}

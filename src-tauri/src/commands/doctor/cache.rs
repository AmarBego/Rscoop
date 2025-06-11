//! Commands for managing the Scoop cache.
use crate::utils;
use rayon::prelude::*;
use serde::Serialize;
use std::fs;
use std::path::{Path};
use tauri::{AppHandle, Runtime};

/// Represents a single entry in the Scoop cache.
#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CacheEntry {
    pub name: String,
    pub version: String,
    pub length: u64,
    pub file_name: String,
}

/// Parses a `CacheEntry` from a given file path.
///
/// The file name is expected to be in the format `name#version#hash.ext`.
fn parse_cache_entry_from_path(path: &Path) -> Option<CacheEntry> {
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

    Some(CacheEntry {
        name: parts[0].to_string(),
        version: parts[1].to_string(),
        length: metadata.len(),
        file_name,
    })
}

/// Lists all entries in the Scoop cache directory.
///
/// This function reads the cache directory, parses each file to extract cache information,
/// and returns a sorted list of cache entries.
#[tauri::command]
pub async fn list_cache_contents<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Vec<CacheEntry>, String> {
    log::info!("Listing cache contents from filesystem");

    let cache_path = utils::resolve_scoop_root(app)?.join("cache");

    if !cache_path.is_dir() {
        log::warn!("Scoop cache directory not found at: {:?}", cache_path);
        return Ok(vec![]);
    }

    let read_dir = fs::read_dir(&cache_path)
        .map_err(|e| format!("Failed to read cache directory: {}", e))?;

    let mut entries: Vec<CacheEntry> = read_dir
        .par_bridge()
        .filter_map(Result::ok)
        .filter_map(|entry| parse_cache_entry_from_path(&entry.path()))
        .collect();

    entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    Ok(entries)
}

/// Clears specified files or the entire Scoop cache.
///
/// # Arguments
/// * `files` - An optional vector of file names to remove. If `None`, the entire cache is cleared.
#[tauri::command]
pub async fn clear_cache<R: Runtime>(
    app: AppHandle<R>,
    files: Option<Vec<String>>,
) -> Result<(), String> {
    log::info!("Clearing cache from filesystem. Files: {:?}", &files);

    let cache_path = utils::resolve_scoop_root(app)?.join("cache");

    if !cache_path.is_dir() {
        return Ok(());
    }

    match files {
        Some(files_to_delete) if !files_to_delete.is_empty() => {
            clear_specific_files(&cache_path, &files_to_delete)
        }
        _ => clear_entire_cache(&cache_path),
    }
}

/// Removes a specific list of files from the cache directory.
fn clear_specific_files(cache_path: &Path, files_to_delete: &[String]) -> Result<(), String> {
    log::info!("Clearing {} specified cache files.", files_to_delete.len());

    files_to_delete.par_iter().for_each(|file_name| {
        let file_path = cache_path.join(file_name);
        if file_path.is_file() {
            if let Err(e) = fs::remove_file(&file_path) {
                log::error!("Failed to delete cache file {}: {}", file_name, e);
            }
        }
    });

    Ok(())
}

/// Removes all files from the cache directory.
fn clear_entire_cache(cache_path: &Path) -> Result<(), String> {
    log::info!("Clearing all files from cache directory.");

    let dir_entries = fs::read_dir(cache_path)
        .map_err(|e| format!("Failed to read cache directory: {}", e))?;

    dir_entries
        .par_bridge()
        .filter_map(Result::ok)
        .for_each(|entry| {
            let path = entry.path();
            if path.is_file() {
                if let Err(e) = fs::remove_file(&path) {
                    log::error!("Failed to remove cache file {:?}: {}", path.file_name(), e);
                }
            }
        });

    Ok(())
}
 
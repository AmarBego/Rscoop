use serde::Serialize;
use tauri::{AppHandle, Runtime};
use crate::utils;
use std::fs;
use std::path::PathBuf;

// Represents the data structure we send to the frontend (camelCase).
#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CacheEntry {
    pub name: String,
    pub version: String,
    pub length: u64,
    pub file_name: String,
}

// Helper function to parse a cache file entry.
fn parse_cache_entry_from_path(path: &PathBuf) -> Option<CacheEntry> {
    if !path.is_file() {
        return None;
    }

    let file_name = match path.file_name().and_then(|name| name.to_str()) {
        Some(name) => name.to_string(),
        None => return None,
    };

    let parts: Vec<&str> = file_name.split('#').collect();

    // Expects format like `name#version#hash.ext`
    if parts.len() < 2 {
        log::warn!("Skipping cache file with unexpected format: {}", file_name);
        return None;
    }

    let name = parts[0].to_string();
    let version = parts[1].to_string();

    match fs::metadata(path) {
        Ok(metadata) => Some(CacheEntry {
            name,
            version,
            length: metadata.len(),
            file_name,
        }),
        Err(e) => {
            log::error!("Failed to get metadata for {}: {}", file_name, e);
            None
        }
    }
}

#[tauri::command]
pub async fn list_cache_contents<R: Runtime>(app: AppHandle<R>) -> Result<Vec<CacheEntry>, String> {
    log::info!("Listing cache contents from filesystem");

    let scoop_path = utils::find_scoop_dir(app).map_err(|e| e.to_string())?;
    let cache_path = scoop_path.join("cache");

    if !cache_path.exists() || !cache_path.is_dir() {
        log::warn!("Scoop cache directory not found at: {:?}", cache_path);
        return Ok(vec![]);
    }

    let mut entries = vec![];
    let read_dir = fs::read_dir(&cache_path).map_err(|e| format!("Failed to read cache directory: {}", e))?;
    
    for dir_entry_result in read_dir {
        match dir_entry_result {
            Ok(dir_entry) => {
                if let Some(cache_entry) = parse_cache_entry_from_path(&dir_entry.path()) {
                    entries.push(cache_entry);
                }
            }
            Err(e) => {
                log::error!("Error reading directory entry in cache: {}", e);
            }
        }
    }
    
    entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    Ok(entries)
}

#[tauri::command]
pub async fn clear_cache<R: Runtime>(app: AppHandle<R>, files: Option<Vec<String>>) -> Result<(), String> {
    log::info!("Clearing cache from filesystem. Files: {:?}", &files);

    let scoop_path = utils::find_scoop_dir(app).map_err(|e| e.to_string())?;
    let cache_path = scoop_path.join("cache");

    if !cache_path.exists() {
        return Ok(());
    }

    match files {
        Some(files_to_delete) => {
            if files_to_delete.is_empty() {
                log::info!("No specific cache files requested for deletion.");
                return Ok(());
            }

            log::info!("Clearing {} specified cache files.", files_to_delete.len());
            for file_name in files_to_delete {
                let file_path = cache_path.join(&file_name);
                if file_path.exists() && file_path.is_file() {
                    if let Err(e) = fs::remove_file(&file_path) {
                        log::error!("Failed to delete cache file {}: {}", file_name, e);
                    }
                }
            }
        }
        None => {
            log::info!("Clearing all files from cache directory.");
            let dir_entries = fs::read_dir(&cache_path)
                .map_err(|e| format!("Failed to read cache directory: {}", e))?;
            
            for entry in dir_entries {
                if let Ok(entry) = entry {
                    let path = entry.path();
                    if path.is_file() {
                        if let Err(e) = fs::remove_file(&path) {
                            log::error!("Failed to remove cache file {:?}: {}", path.file_name(), e);
                        }
                    }
                }
            }
        }
    }

    Ok(())
} 
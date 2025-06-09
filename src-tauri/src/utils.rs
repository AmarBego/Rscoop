use crate::commands::settings;
use std::env;
use std::path::PathBuf;
use tauri::{AppHandle, Runtime};

pub fn find_scoop_dir<R: Runtime>(app: AppHandle<R>) -> Result<PathBuf, String> {
    // 1. Check the user-defined path from settings first
    if let Ok(Some(path_str)) = settings::get_scoop_path(app) {
        let path = PathBuf::from(path_str);
        if path.exists() && path.is_dir() {
            log::info!("Using user-defined scoop path: {}", path.display());
            return Ok(path);
        } else {
            log::warn!("User-defined scoop path is invalid: {}", path.display());
        }
    }

    // 2. Fallback to environment variable
    if let Ok(scoop_path) = env::var("SCOOP") {
        let path = PathBuf::from(scoop_path);
        if path.exists() {
            log::info!("Using SCOOP environment variable: {}", path.display());
            return Ok(path);
        }
    }

    // 3. Fallback to default user profile location
    if let Ok(user_profile) = env::var("USERPROFILE") {
        let scoop_path = PathBuf::from(user_profile).join("scoop");
        if scoop_path.exists() {
            log::info!("Using default user profile path: {}", scoop_path.display());
            return Ok(scoop_path);
        }
    }

    // 4. Fallback to system-wide location
    let program_data = PathBuf::from("C:\\ProgramData\\scoop");
    if program_data.exists() {
        log::info!("Using system-wide path: {}", program_data.display());
        return Ok(program_data);
    }

    Err("Could not find scoop directory. Please set it in the settings.".to_string())
}

pub fn find_package_manifest(
    scoop_dir: &std::path::Path,
    package_name: &str,
    package_source: Option<String>,
) -> Result<(PathBuf, String), String> {
    let buckets_dir = scoop_dir.join("buckets");

    if !buckets_dir.is_dir() {
        return Err("Scoop 'buckets' directory not found.".to_string());
    }

    let search_buckets = |bucket_path: PathBuf| -> Result<(PathBuf, String), String> {
        if bucket_path.is_dir() {
            let bucket_name = bucket_path
                .file_name()
                .unwrap()
                .to_string_lossy()
                .to_string();

            let manifest_filename = format!("{}.json", package_name);

            let manifest_path = bucket_path.join(&manifest_filename);
            if manifest_path.exists() {
                return Ok((manifest_path, bucket_name));
            }

            let nested_manifest_path = bucket_path.join("bucket").join(&manifest_filename);
            if nested_manifest_path.exists() {
                return Ok((nested_manifest_path, bucket_name));
            }
        }
        Err(format!("Package '{}' not found.", package_name))
    };

    if let Some(source) = package_source {
        if !source.is_empty() && source != "None" {
            let specific_bucket_path = buckets_dir.join(&source);
            return search_buckets(specific_bucket_path)
                .map_err(|_| format!("Package '{}' not found in bucket '{}'.", package_name, source));
        }
    }
    
    for entry in std::fs::read_dir(buckets_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if let Ok(found) = search_buckets(entry.path()) {
            return Ok(found);
        }
    }

    Err(format!(
        "Package '{}' not found in any bucket.",
        package_name
    ))
} 
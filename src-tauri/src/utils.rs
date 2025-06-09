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
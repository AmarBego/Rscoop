// Many thanks to Kwensiu for the original code on the forked repo: https://github.com/Kwensiu/Rscoop
//! Commands for managing application startup settings on Windows.

use std::env;
use tauri;
use winreg::enums::*;
use winreg::RegKey;
const REG_KEY_PATH: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const REG_KEY_NAME: &str = "Rscoop";

/// Checks if the application is configured to start automatically on Windows boot.

#[tauri::command]

pub fn is_auto_start_enabled() -> Result<bool, String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let startup_key = hkcu.open_subkey(REG_KEY_PATH).map_err(|e| e.to_string())?;

    // Check if our registry key exists
    match startup_key.get_value::<String, _>(REG_KEY_NAME) {
        Ok(current_value) => {
            // Check if the current executable path matches the registered one
            let current_exe = env::current_exe().map_err(|e| e.to_string())?;
            Ok(current_value == current_exe.to_string_lossy())
        }
        Err(_) => Ok(false),
    }
}

/// Sets whether the application should start automatically on Windows boot.
#[tauri::command]

pub fn set_auto_start_enabled(enabled: bool) -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let startup_key = hkcu
        .open_subkey_with_flags(REG_KEY_PATH, KEY_SET_VALUE)
        .map_err(|e| e.to_string())?;

    if enabled {
        // Enable auto-start by adding registry key
        let current_exe = env::current_exe().map_err(|e| e.to_string())?;
        startup_key
            .set_value(REG_KEY_NAME, &current_exe.to_string_lossy().to_string())
            .map_err(|e| e.to_string())?;
    } else {
        // Disable auto-start by removing registry key
        match startup_key.delete_value(REG_KEY_NAME) {
            Ok(_) => (),
            Err(e) => {
                // Ignore error if key doesn't exist
                if e.kind() != std::io::ErrorKind::NotFound {
                    return Err(e.to_string());
                }
            }
        }
    }
    Ok(())
}

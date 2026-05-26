// Many thanks to Kwensiu for the original code on the forked repo: https://github.com/Kwensiu/Rscoop
//! Commands for managing application startup settings on Windows.

use std::env;
use tauri;

#[cfg(target_os = "windows")]
use winreg::{enums::*, RegKey};

const REG_KEY_PATH: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const REG_KEY_NAME: &str = "Rscoop";
pub const START_MINIMIZED_ARG: &str = "--rscoop-start-minimized";

#[cfg(target_os = "windows")]
fn startup_command(start_minimized: bool) -> Result<String, String> {
    let current_exe = env::current_exe().map_err(|e| e.to_string())?;
    let exe = current_exe.to_string_lossy();
    if start_minimized {
        Ok(format!("\"{}\" {}", exe, START_MINIMIZED_ARG))
    } else {
        Ok(format!("\"{}\"", exe))
    }
}

#[cfg(target_os = "windows")]
fn registered_command_matches_current_exe(command: &str) -> Result<bool, String> {
    let current_exe = env::current_exe().map_err(|e| e.to_string())?;
    let command = command.trim();
    let registered_exe = if let Some(rest) = command.strip_prefix('"') {
        rest.split_once('"').map(|(exe, _)| exe).unwrap_or(rest)
    } else {
        command.split_whitespace().next().unwrap_or(command)
    };

    Ok(registered_exe.eq_ignore_ascii_case(&current_exe.to_string_lossy()))
}

/// Checks if the application is configured to start automatically on Windows boot.
#[tauri::command]
pub fn is_auto_start_enabled() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let startup_key = hkcu.open_subkey(REG_KEY_PATH).map_err(|e| e.to_string())?;

        // Check if our registry key exists
        match startup_key.get_value::<String, _>(REG_KEY_NAME) {
            Ok(current_value) => {
                // Check if the registered command points to the current executable.
                // It may include launch arguments such as START_MINIMIZED_ARG.
                registered_command_matches_current_exe(&current_value)
            }
            Err(_) => Ok(false),
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(false)
    }
}

/// Sets whether the application should start automatically on Windows boot.
#[tauri::command]
pub fn set_auto_start_enabled(enabled: bool) -> Result<(), String> {
    set_auto_start_enabled_with_options(enabled, false)
}

/// Sets whether the application should start automatically on Windows boot,
/// with optional launch behavior.
#[tauri::command]
pub fn set_auto_start_enabled_with_options(
    enabled: bool,
    start_minimized: bool,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let startup_key = hkcu
            .open_subkey_with_flags(REG_KEY_PATH, KEY_SET_VALUE)
            .map_err(|e| e.to_string())?;

        if enabled {
            // Enable auto-start by adding registry key
            startup_key
                .set_value(REG_KEY_NAME, &startup_command(start_minimized)?)
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
    #[cfg(not(target_os = "windows"))]
    {
        Err("Auto-start is only supported on Windows".to_string())
    }
}

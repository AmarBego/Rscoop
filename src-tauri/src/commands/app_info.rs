use crate::utils;
/// Checks if the application is installed via Scoop package manager
#[tauri::command]
pub fn is_scoop_installation() -> bool {
    utils::is_scoop_installation()
}

/// Checks if the current working directory matches the application's install directory.
/// Returns true if they don't match (indicating MSI installation issue).
#[tauri::command]
pub fn is_cwd_mismatch() -> bool {
    utils::is_cwd_mismatch()
}

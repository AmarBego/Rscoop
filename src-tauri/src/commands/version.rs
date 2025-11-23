use std::fs;
use tauri::AppHandle;

/// Checks if the currently running version differs from the persisted version file.
/// If different (or file missing), writes the new version and returns true.
#[tauri::command]
pub fn check_and_update_version(app: AppHandle) -> Result<bool, String> {
    let current_version = app.package_info().version.to_string();
    let data_dir = dirs::data_local_dir()
        .ok_or_else(|| "Could not resolve local app data directory".to_string())?
        .join("rscoop");

    if !data_dir.exists() {
        fs::create_dir_all(&data_dir).map_err(|e| format!("Failed to create data dir: {}", e))?;
    }

    let version_path = data_dir.join("version.txt");
    let stored_version = fs::read_to_string(&version_path).unwrap_or_default();

    if stored_version.trim() == current_version {
        log::trace!("Version {} unchanged from persisted file.", current_version);
        return Ok(false);
    }

    fs::write(&version_path, &current_version)
        .map_err(|e| format!("Failed to write version file: {}", e))?;

    log::info!("Detected new version {} (persisted).", current_version);
    Ok(true)
}

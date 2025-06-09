use crate::utils;
use std::fs;
use tauri::{AppHandle, Runtime};

#[tauri::command]
pub fn get_package_manifest<R: Runtime>(
    app: AppHandle<R>,
    package_name: String,
    package_source: String,
) -> Result<String, String> {
    log::info!(
        "Fetching manifest for package: {} from bucket {}",
        package_name,
        package_source
    );

    let scoop_dir = utils::find_scoop_dir(app)?;
    
    let source = if package_source.is_empty() || package_source == "None" {
        None
    } else {
        Some(package_source)
    };
    
    let (manifest_path, _) =
        utils::find_package_manifest(&scoop_dir, &package_name, source)?;

    fs::read_to_string(&manifest_path)
        .map_err(|e| format!("Failed to read manifest for {}: {}", package_name, e))
} 
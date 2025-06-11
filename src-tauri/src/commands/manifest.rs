//! Command for fetching the raw JSON manifest of a Scoop package.
use crate::utils;
use std::fs;
use tauri::{AppHandle, Runtime};

/// Fetches the manifest content for a given package from a specific bucket.
///
/// # Arguments
/// * `app` - The Tauri application handle.
/// * `package_name` - The name of the package to fetch the manifest for.
/// * `bucket` - The name of the bucket where the package is located. If empty or "None",
///              it will search in all available buckets.
#[tauri::command]
pub fn get_package_manifest<R: Runtime>(
    app: AppHandle<R>,
    package_name: String,
    bucket: String,
) -> Result<String, String> {
    log::info!(
        "Fetching manifest for package '{}' from bucket '{}'",
        package_name,
        bucket
    );

    let scoop_dir = utils::resolve_scoop_root(app)?;

    // Handle optional bucket parameter.
    let bucket_option = if bucket.is_empty() || bucket == "None" {
        None
    } else {
        Some(bucket)
    };

    let (manifest_path, _) =
        utils::locate_package_manifest(&scoop_dir, &package_name, bucket_option)?;

    fs::read_to_string(&manifest_path)
        .map_err(|e| format!("Failed to read manifest for {}: {}", package_name, e))
}
 
//! Commands for opening validated Scoop paths through the OS shell.
use crate::state::AppState;
use crate::utils::validate_scoop_child_dir;
use tauri::{AppHandle, Runtime, State};
use tauri_plugin_opener::OpenerExt;

fn open_validated_path<R: Runtime>(
    app: AppHandle<R>,
    path: std::path::PathBuf,
) -> Result<(), String> {
    app.opener()
        .open_path(path.to_string_lossy().to_string(), None::<String>)
        .map_err(|e| format!("Failed to open '{}': {}", path.display(), e))
}

#[tauri::command]
pub fn open_package_path<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    package_name: String,
) -> Result<(), String> {
    let package_path =
        validate_scoop_child_dir(&state.scoop_path().join("apps"), &package_name, "Package")?;

    open_validated_path(app, package_path)
}

#[tauri::command]
pub fn open_bucket_path<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    bucket_name: String,
) -> Result<(), String> {
    let bucket_path =
        validate_scoop_child_dir(&state.scoop_path().join("buckets"), &bucket_name, "Bucket")?;

    open_validated_path(app, bucket_path)
}

use tauri::Window;
use crate::commands::scoop::{self, ScoopOp};

#[tauri::command]
pub async fn uninstall_package(
    window: Window,
    package_name: String,
    package_source: String,
) -> Result<(), String> {
    let bucket_opt = if package_source.is_empty() || package_source == "None" { None } else { Some(package_source.as_str()) };
    scoop::execute_scoop(window, ScoopOp::Uninstall, Some(&package_name), bucket_opt).await
}

#[tauri::command]
pub async fn clear_package_cache(
    window: Window,
    package_name: String,
    package_source: String,
) -> Result<(), String> {
    let bucket_opt = if package_source.is_empty() || package_source == "None" { None } else { Some(package_source.as_str()) };
    scoop::execute_scoop(window, ScoopOp::ClearCache, Some(&package_name), bucket_opt).await
}
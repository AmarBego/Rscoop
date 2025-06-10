use tauri::Window;
use crate::commands::scoop::{self, ScoopOp};

#[tauri::command]
pub async fn install_package(
    window: Window,
    package_name: String,
    package_source: String,
) -> Result<(), String> {
    log::info!("Attempting to install package '{}' from bucket '{}'", package_name, package_source);

    let bucket_opt = if package_source.is_empty() || package_source == "None" { None } else { Some(package_source.as_str()) };

    scoop::execute_scoop(window, ScoopOp::Install, Some(&package_name), bucket_opt).await
}
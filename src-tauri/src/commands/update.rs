use crate::commands::scoop::{self, ScoopOp};
use tauri::Window;

/// Updates a specific Scoop package.
#[tauri::command]
pub async fn update_package(window: Window, package_name: String) -> Result<(), String> {
    log::info!("Updating package '{}'", package_name);
    scoop::execute_scoop(window, ScoopOp::Update, Some(&package_name), None).await
}

/// Updates all Scoop packages.
#[tauri::command]
pub async fn update_all_packages(window: Window) -> Result<(), String> {
    log::info!("Updating all packages");
    scoop::execute_scoop(window, ScoopOp::UpdateAll, None, None).await
}
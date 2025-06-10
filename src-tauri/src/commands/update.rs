use tauri::Window;
use crate::commands::scoop::{self, ScoopOp};

#[tauri::command]
pub async fn update_package(window: Window, package_name: String) -> Result<(), String> {
    scoop::execute_scoop(window, ScoopOp::Update, Some(&package_name), None).await
}

#[tauri::command]
pub async fn update_all_packages(window: Window) -> Result<(), String> {
    scoop::execute_scoop(window, ScoopOp::UpdateAll, None, None).await
}
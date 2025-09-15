use std::env;
use tauri;

/// Checks if the application is installed via Scoop package manager
#[tauri::command]
pub fn is_scoop_installation() -> bool {
    if let Ok(exe_path) = env::current_exe() {
        let path_str = exe_path.to_string_lossy().to_lowercase();
        path_str.contains("scoop") && path_str.contains("apps") && path_str.contains("rscoop")
    } else {
        false
    }
}

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

/// Checks if the current working directory matches the application's install directory.
/// Returns true if they don't match (indicating MSI installation issue).
#[tauri::command]
pub fn is_cwd_mismatch() -> bool {
    if let (Ok(exe_path), Ok(cwd)) = (env::current_exe(), env::current_dir()) {
        // Get the directory containing the executable
        let exe_dir = if let Some(parent) = exe_path.parent() {
            parent.to_path_buf()
        } else {
            return false;
        };

        // Compare the directories
        exe_dir != cwd
    } else {
        false
    }
}

/// Closes the application
#[tauri::command]
pub fn close_app<R: tauri::Runtime>(app: tauri::AppHandle<R>) {
    app.exit(0);
}

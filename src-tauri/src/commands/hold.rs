use crate::utils;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Runtime};

/// Resolves the path to the `install.json` file for the currently installed version of a package.
fn get_current_install_json_path<R: Runtime>(
    app: &AppHandle<R>,
    package_name: &str,
) -> Result<PathBuf, String> {
    let scoop_path = utils::find_scoop_dir(app.clone())?;
    let package_path = scoop_path.join("apps").join(package_name);

    if !package_path.is_dir() {
        return Err(format!("Package directory for '{}' not found.", package_name));
    }

    let current_path = package_path.join("current");

    if !current_path.exists() {
        return Err(format!(
            "Package '{}' is not installed correctly (missing 'current' link).",
            package_name
        ));
    }

    // On Windows, Scoop uses junctions. `fs::canonicalize` resolves them to the actual version path.
    let version_path = fs::canonicalize(&current_path).map_err(|e| {
        format!(
            "Could not resolve 'current' path for {}: {}",
            package_name, e
        )
    })?;

    let install_json_path = version_path.join("install.json");

    if !install_json_path.is_file() {
        return Err(format!(
            "install.json not found for package '{}' at {}.",
            package_name,
            install_json_path.display()
        ));
    }

    Ok(install_json_path)
}

#[tauri::command]
pub async fn list_held_packages<R: Runtime>(app: AppHandle<R>) -> Result<Vec<String>, String> {
    log::info!("Listing held packages by checking install.json");

    let scoop_path = match utils::find_scoop_dir(app) {
        Ok(path) => path,
        Err(e) => {
            log::error!("Failed to find scoop directory: {}", e);
            return Err(e);
        }
    };

    let apps_path = scoop_path.join("apps");
    if !apps_path.is_dir() {
        log::warn!("Scoop apps directory not found at {}", apps_path.display());
        return Ok(vec![]);
    }

    let mut held_packages = Vec::new();
    let app_dirs = match fs::read_dir(apps_path) {
        Ok(dirs) => dirs,
        Err(e) => return Err(format!("Failed to read apps directory: {}", e)),
    };

    for entry in app_dirs.filter_map(Result::ok) {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let package_name = match path.file_name().and_then(|n| n.to_str()) {
            Some(name) => name,
            None => continue,
        };

        let current_path = path.join("current");
        if !current_path.exists() {
            continue;
        }

        let version_path = match fs::canonicalize(&current_path) {
            Ok(p) => p,
            Err(_) => continue, // Ignore if the link is broken
        };

        let install_json_path = version_path.join("install.json");
        if !install_json_path.is_file() {
            continue;
        }

        if let Ok(content) = fs::read_to_string(&install_json_path) {
            if let Ok(value) = serde_json::from_str::<Value>(&content) {
                if value.get("hold").and_then(Value::as_bool) == Some(true) {
                    held_packages.push(package_name.to_string());
                }
            }
        }
    }

    log::info!("Found {} held packages", held_packages.len());
    Ok(held_packages)
}

#[tauri::command]
pub async fn hold_package<R: Runtime>(
    app: AppHandle<R>,
    package_name: String,
) -> Result<(), String> {
    log::info!("Placing a hold on: {}", package_name);

    let install_json_path = get_current_install_json_path(&app, &package_name)?;
    let content = fs::read_to_string(&install_json_path).map_err(|e| e.to_string())?;

    let mut value: Value =
        serde_json::from_str(&content).map_err(|e| format!("Invalid JSON in install.json: {}", e))?;

    if let Some(obj) = value.as_object_mut() {
        obj.insert("hold".to_string(), serde_json::json!(true));
    } else {
        return Err("install.json is not a valid JSON object.".to_string());
    }

    let new_content =
        serde_json::to_string_pretty(&value).map_err(|e| format!("Failed to serialize JSON: {}", e))?;
    fs::write(&install_json_path, new_content)
        .map_err(|e| format!("Failed to write to install.json: {}", e))
}

#[tauri::command]
pub async fn unhold_package<R: Runtime>(
    app: AppHandle<R>,
    package_name: String,
) -> Result<(), String> {
    log::info!("Removing hold from: {}", package_name);

    let install_json_path = get_current_install_json_path(&app, &package_name)?;
    let content = fs::read_to_string(&install_json_path).map_err(|e| e.to_string())?;

    let mut value: Value =
        serde_json::from_str(&content).map_err(|e| format!("Invalid JSON in install.json: {}", e))?;

    if let Some(obj) = value.as_object_mut() {
        obj.remove("hold");
    } else {
        log::warn!(
            "Could not unhold package '{}' because install.json is not a valid object.",
            package_name
        );
        return Ok(());
    }

    let new_content =
        serde_json::to_string_pretty(&value).map_err(|e| format!("Failed to serialize JSON: {}", e))?;
    fs::write(&install_json_path, new_content)
        .map_err(|e| format!("Failed to write to install.json: {}", e))
} 
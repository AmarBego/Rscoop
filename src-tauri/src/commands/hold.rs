//! Commands for holding and unholding Scoop packages.
use crate::utils;
use rayon::prelude::*;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Runtime};

/// Resolves the path to the `install.json` file for the currently installed version of a package.
/// This file contains metadata about the installation, including its hold status.
fn get_current_install_json_path(
    scoop_dir: &std::path::Path,
    package_name: &str,
) -> Result<PathBuf, String> {
    let package_path = scoop_dir.join("apps").join(package_name);
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

/// Checks if a specific package is currently on hold.
fn is_package_held(scoop_dir: &std::path::Path, package_name: &str) -> Result<bool, String> {
    let install_json_path = get_current_install_json_path(scoop_dir, package_name)?;
    let content = fs::read_to_string(&install_json_path).map_err(|e| e.to_string())?;
    let value: Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(value.get("hold").and_then(Value::as_bool) == Some(true))
}

/// Modifies the hold status of a package by updating its `install.json`.
fn modify_hold_status<R: Runtime>(
    app: AppHandle<R>,
    package_name: &str,
    hold: bool,
) -> Result<(), String> {
    let scoop_dir = utils::resolve_scoop_root(app)?;
    let install_json_path = get_current_install_json_path(&scoop_dir, package_name)?;
    let content = fs::read_to_string(&install_json_path).map_err(|e| e.to_string())?;

    let mut value: Value =
        serde_json::from_str(&content).map_err(|e| format!("Invalid JSON in install.json: {}", e))?;

    let obj = value
        .as_object_mut()
        .ok_or("install.json is not a valid JSON object.")?;

    if hold {
        obj.insert("hold".to_string(), serde_json::json!(true));
    } else {
        obj.remove("hold");
    }

    let new_content =
        serde_json::to_string_pretty(&value).map_err(|e| format!("Failed to serialize JSON: {}", e))?;
    fs::write(&install_json_path, new_content)
        .map_err(|e| format!("Failed to write to install.json: {}", e))
}

/// Lists all packages that are currently on hold.
#[tauri::command]
pub async fn list_held_packages<R: Runtime>(app: AppHandle<R>) -> Result<Vec<String>, String> {
    log::info!("Listing held packages by checking all install.json files");

    let scoop_path = utils::resolve_scoop_root(app)?;
    let apps_path = scoop_path.join("apps");
    if !apps_path.is_dir() {
        log::warn!("Scoop apps directory not found at {}", apps_path.display());
        return Ok(vec![]);
    }

    let app_dirs = fs::read_dir(apps_path)
        .map_err(|e| format!("Failed to read apps directory: {}", e))?
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_dir())
        .collect::<Vec<_>>();

    let held_packages = app_dirs
        .par_iter()
        .filter_map(|entry| {
            let package_name = entry.file_name().to_string_lossy().to_string();
            match is_package_held(&scoop_path, &package_name) {
                Ok(true) => Some(package_name),
                _ => None,
            }
        })
        .collect::<Vec<String>>();

    log::info!("Found {} held packages", held_packages.len());
    Ok(held_packages)
}

/// Places a hold on a package to prevent it from being updated.
#[tauri::command]
pub async fn hold_package<R: Runtime>(
    app: AppHandle<R>,
    package_name: String,
) -> Result<(), String> {
    log::info!("Placing a hold on: {}", package_name);
    modify_hold_status(app, &package_name, true)
}

/// Removes the hold on a package, allowing it to be updated.
#[tauri::command]
pub async fn unhold_package<R: Runtime>(
    app: AppHandle<R>,
    package_name: String,
) -> Result<(), String> {
    log::info!("Removing hold from: {}", package_name);
    modify_hold_status(app, &package_name, false)
}
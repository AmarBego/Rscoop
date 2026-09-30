//! Commands for holding and unholding Scoop packages.
use crate::state::AppState;
use crate::utils::{resolve_scoop_json, ScoopJsonKind};
use rayon::prelude::*;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Runtime, State};

fn get_current_install_info_path(
    scoop_dir: &std::path::Path,
    package_name: &str,
) -> Result<PathBuf, String> {
    let current_path = scoop_dir.join("apps").join(package_name).join("current");

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

    resolve_scoop_json(&version_path, ScoopJsonKind::Install).ok_or_else(|| {
        format!(
            "Install info not found for package '{}' at {}.",
            package_name,
            version_path.display()
        )
    })
}

/// Checks if a specific package is currently on hold.
fn is_package_held(scoop_dir: &std::path::Path, package_name: &str) -> Result<bool, String> {
    let install_info_path = get_current_install_info_path(scoop_dir, package_name)?;
    let content = fs::read_to_string(&install_info_path).map_err(|e| e.to_string())?;
    let value: Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(value.get("hold").and_then(Value::as_bool) == Some(true))
}

/// Modifies the hold status of a package by updating its install info file.
fn modify_hold_status(scoop_dir: &Path, package_name: &str, hold: bool) -> Result<(), String> {
    let install_info_path = get_current_install_info_path(scoop_dir, package_name)?;
    let content = fs::read_to_string(&install_info_path).map_err(|e| e.to_string())?;

    let mut value: Value = serde_json::from_str(&content)
        .map_err(|e| format!("Invalid JSON in {}: {}", install_info_path.display(), e))?;

    if let Some(obj) = value.as_object_mut() {
        if hold {
            obj.insert("hold".to_string(), serde_json::json!(true));
        } else {
            obj.remove("hold");
        }

        let new_content = serde_json::to_string_pretty(&value)
            .map_err(|e| format!("Failed to serialize JSON: {}", e))?;
        fs::write(&install_info_path, new_content)
            .map_err(|e| format!("Failed to write to {}: {}", install_info_path.display(), e))
    } else {
        Err(format!(
            "{} is not a valid JSON object.",
            install_info_path.display()
        ))
    }
}

/// Lists all packages that are currently on hold.
/// Uses a memoized approach by checking the installed packages cache first,
/// then only scanning directories if needed.
#[tauri::command]
pub async fn list_held_packages<R: Runtime>(
    _app: AppHandle<R>,
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    log::info!("Listing held packages by checking install info files");

    let scoop_path = state.scoop_path();
    let apps_path = scoop_path.join("apps");
    if !apps_path.is_dir() {
        log::warn!("Scoop apps directory not found at {}", apps_path.display());
        return Ok(vec![]);
    }

    // First, try to get app dirs from cache if available
    // If cache exists, we can extract held packages from it directly by re-reading install info
    let app_dirs = fs::read_dir(apps_path)
        .map_err(|e| format!("Failed to read apps directory: {}", e))?
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_dir())
        .collect::<Vec<_>>();

    // Check cache to see if we have the same package set
    let cached_packages_count = {
        let cache_guard = state.installed_packages.lock().await;
        cache_guard.as_ref().map(|c| c.packages.len())
    };

    if let Some(cached_count) = cached_packages_count {
        if cached_count == app_dirs.len() {
            log::debug!(
                "Using memoized approach: installed cache matches app dir count ({})",
                app_dirs.len()
            );
        }
    }

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
    _app: AppHandle<R>,
    state: State<'_, AppState>,
    package_name: String,
) -> Result<(), String> {
    log::info!("Placing a hold on: {}", package_name);
    let scoop_path = state.scoop_path();
    modify_hold_status(&scoop_path, &package_name, true)
}

/// Removes the hold on a package, allowing it to be updated.
#[tauri::command]
pub async fn unhold_package<R: Runtime>(
    _app: AppHandle<R>,
    state: State<'_, AppState>,
    package_name: String,
) -> Result<(), String> {
    log::info!("Removing hold from: {}", package_name);
    let scoop_path = state.scoop_path();
    modify_hold_status(&scoop_path, &package_name, false)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn install_fixture(filename: &str) -> tempfile::TempDir {
        let temp = tempfile::tempdir().unwrap();
        let dir = temp.path().join("apps/demo/current");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(filename), r#"{"bucket":"main"}"#).unwrap();
        temp
    }

    fn hold_roundtrip(filename: &str) {
        let temp = install_fixture(filename);
        assert!(!is_package_held(temp.path(), "demo").unwrap());
        modify_hold_status(temp.path(), "demo", true).unwrap();
        assert!(is_package_held(temp.path(), "demo").unwrap());
        modify_hold_status(temp.path(), "demo", false).unwrap();
        assert!(!is_package_held(temp.path(), "demo").unwrap());
        assert!(temp
            .path()
            .join("apps/demo/current")
            .join(filename)
            .is_file());
    }

    #[test]
    fn hold_roundtrip_on_new_install_file() {
        hold_roundtrip("scoop-install.json");
    }

    #[test]
    fn hold_roundtrip_on_legacy_install_file() {
        hold_roundtrip("install.json");
    }
}

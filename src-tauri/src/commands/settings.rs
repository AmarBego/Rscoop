//! Commands for reading and writing application settings from the persistent store.
use serde_json::{Map, Value};
use std::env;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Runtime};
use tauri_plugin_store::{Store, StoreExt};

const STORE_PATH: &str = "store.json";

/// A helper function to reduce boilerplate when performing a write operation on the store.
///
/// It loads the store, applies the given operation, and saves the changes to disk.
fn with_store_mut<R: Runtime, F, T>(app: AppHandle<R>, operation: F) -> Result<T, String>
where
    F: FnOnce(&Store<R>) -> T,
{
    let store = app
        .store(PathBuf::from(STORE_PATH))
        .map_err(|e| e.to_string())?;
    let result = operation(&store);
    store.save().map_err(|e| e.to_string())?;
    Ok(result)
}

/// A helper function to reduce boilerplate when performing a read operation on the store.
fn with_store_get<R: Runtime, F, T>(app: AppHandle<R>, operation: F) -> Result<T, String>
where
    F: FnOnce(&Store<R>) -> T,
{
    let store = app
        .store(PathBuf::from(STORE_PATH))
        .map_err(|e| e.to_string())?;
    Ok(operation(&store))
}

/// Returns the path to the Scoop configuration file.
///
/// Typically: `C:\Users\USER\.config\scoop\config.json`
fn get_scoop_config_path() -> Result<PathBuf, String> {
    // Accommodate both Windows and Unix-like systems for development purposes.
    let home_dir = env::var("USERPROFILE")
        .or_else(|_| env::var("HOME"))
        .map_err(|_| "Could not determine the user's home directory.")?;

    Ok(PathBuf::from(home_dir)
        .join(".config")
        .join("scoop")
        .join("config.json"))
}

/// Reads the Scoop configuration file and returns its contents as a JSON map.
///
/// If the file doesn't exist, it returns an empty map.
fn read_scoop_config() -> Result<Map<String, Value>, String> {
    let path = get_scoop_config_path()?;
    if !path.exists() {
        return Ok(Map::new());
    }
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read Scoop config at {:?}: {}", path, e))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse Scoop config at {:?}: {}", path, e))
}

/// Writes the given JSON map to the Scoop configuration file.
///
/// This will create the directory and file if they don't exist.
fn write_scoop_config(config: &Map<String, Value>) -> Result<(), String> {
    let path = get_scoop_config_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create Scoop config directory: {}", e))?;
    }
    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize Scoop config: {}", e))?;
    fs::write(&path, content).map_err(|e| format!("Failed to write to {:?}: {}", path, e))
}

/// Gets the configured Scoop path from the store.
#[tauri::command]
pub fn get_scoop_path<R: Runtime>(app: AppHandle<R>) -> Result<Option<String>, String> {
    with_store_get(app, |store| {
        store
            .get("scoop_path")
            .and_then(|v| v.as_str().map(String::from))
    })
}

/// Sets the Scoop path in the store.
#[tauri::command]
pub fn set_scoop_path<R: Runtime>(app: AppHandle<R>, path: String) -> Result<(), String> {
    with_store_mut(app, move |store| {
        store.set("scoop_path", serde_json::json!(path))
    })
}

/// Gets a generic configuration value from the store by its key.
#[tauri::command]
pub fn get_config_value<R: Runtime>(
    app: AppHandle<R>,
    key: String,
) -> Result<Option<Value>, String> {
    with_store_get(app, |store| store.get(&key).map(|v| v.clone()))
}

/// Sets a generic configuration value in the store.
#[tauri::command]
pub fn set_config_value<R: Runtime>(
    app: AppHandle<R>,
    key: String,
    value: Value,
) -> Result<(), String> {
    with_store_mut(app, move |store| store.set(key, value))
}

/// Gets the VirusTotal API key from Scoop's `config.json`.
#[tauri::command]
pub fn get_virustotal_api_key() -> Result<Option<String>, String> {
    let config = read_scoop_config()?;
    Ok(config
        .get("virustotal_api_key")
        .and_then(|v| v.as_str().map(String::from)))
}

/// Sets the VirusTotal API key in Scoop's `config.json`.
///
/// If the key is an empty string, it removes the `virustotal_api_key` field.
#[tauri::command]
pub fn set_virustotal_api_key(key: String) -> Result<(), String> {
    let mut config = read_scoop_config()?;
    if key.is_empty() {
        config.remove("virustotal_api_key");
    } else {
        config.insert("virustotal_api_key".to_string(), serde_json::json!(key));
    }
    write_scoop_config(&config)
}

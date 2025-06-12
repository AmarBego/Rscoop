//! Commands for reading and writing application settings from the persistent store.
use serde_json::Value;
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

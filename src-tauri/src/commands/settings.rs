use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;
use serde_json::Value;
use std::path::PathBuf;

const STORE_PATH: &str = "store.json";

#[tauri::command]
pub fn get_scoop_path<R: Runtime>(app: AppHandle<R>) -> Result<Option<String>, String> {
    let store = app.store(PathBuf::from(STORE_PATH)).map_err(|e| e.to_string())?;
    Ok(store.get("scoop_path").and_then(|v| v.as_str().map(String::from)))
}

#[tauri::command]
pub fn set_scoop_path<R: Runtime>(
    app: AppHandle<R>,
    path: String,
) -> Result<(), String> {
    let store = app.store(PathBuf::from(STORE_PATH)).map_err(|e| e.to_string())?;
    store.set("scoop_path".to_string(), serde_json::json!(path));
    store.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_config_value<R: Runtime>(app: AppHandle<R>, key: String) -> Result<Option<Value>, String> {
    let store = app.store(PathBuf::from(STORE_PATH)).map_err(|e| e.to_string())?;
    Ok(store.get(key).map(|v| v.clone()))
}

#[tauri::command]
pub fn set_config_value<R: Runtime>(
    app: AppHandle<R>,
    key: String,
    value: Value,
) -> Result<(), String> {
    let store = app.store(PathBuf::from(STORE_PATH)).map_err(|e| e.to_string())?;
    store.set(key, value);
    store.save().map_err(|e| e.to_string())
} 
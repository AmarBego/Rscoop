//! Command for fetching detailed information about a Scoop package.
use crate::utils;
use serde::Serialize;
use serde_json::Value;
use std::fs;
use tauri::{AppHandle, Runtime};

/// Represents the structured information for a Scoop package, suitable for frontend display.
#[derive(Serialize, Debug, Clone, Default)]
pub struct ScoopInfo {
    /// A list of key-value pairs representing package details.
    pub details: Vec<(String, String)>,
    /// Optional installation notes provided by the package manifest.
    pub notes: Option<String>,
}

/// Formats a JSON key for display, capitalizing it and handling special cases.
fn format_field_key(key: &str) -> String {
    if key == "bin" {
        return "Includes".to_string();
    }
    let mut c = key.chars();
    match c.next() {
        None => String::new(),
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
    }
}

/// Formats a `serde_json::Value` into a human-readable string.
fn format_json_value(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        Value::Array(arr) => arr
            .iter()
            .map(|v| v.to_string().trim_matches('"').to_string())
            .collect::<Vec<_>>()
            .join(", "),
        _ => value.to_string().trim_matches('"').to_string(),
    }
}

// -----------------------------------------------------------------------------
// Custom formatting helpers
// -----------------------------------------------------------------------------
/// Extracts executable names and aliases from the `bin` field.
fn format_bin_value(value: &Value) -> String {
    if let Value::Array(arr) = value {
        let mut names: Vec<String> = Vec::new();
        for item in arr {
            match item {
                Value::String(s) => names.push(s.clone()),
                Value::Array(sub) => {
                    // First element is the executable path, second (optionally) alias.
                    if let Some(Value::String(alias)) = sub.get(1) {
                        names.push(alias.clone());
                    } else if let Some(Value::String(path)) = sub.get(0) {
                        names.push(path.clone());
                    }
                }
                Value::Object(obj) => {
                    // Object forms: { "alias": "path" }
                    obj.keys().for_each(|k| names.push(k.clone()));
                }
                _ => {}
            }
        }
        names.join(", ")
    } else {
        format_json_value(value)
    }
}

/// Parses the JSON manifest content into a structured format for display.
fn parse_manifest_details(json_value: &Value) -> (Vec<(String, String)>, Option<String>) {
    let mut details = vec![];
    let mut notes = None;

    if let Some(obj) = json_value.as_object() {
        for (key, value) in obj {
            if key == "notes" {
                notes = Some(format_json_value(value));
            } else if key == "bin" {
                let formatted_value = format_bin_value(value);
                details.push(("Includes".to_string(), formatted_value));
            } else {
                let formatted_key = format_field_key(key);
                let formatted_value = format_json_value(value);
                details.push((formatted_key, formatted_value));
            }
        }
    }
    (details, notes)
}

/// Fetches and formats information about a specific Scoop package.
#[tauri::command]
pub fn get_package_info<R: Runtime>(
    app: AppHandle<R>,
    package_name: String,
) -> Result<ScoopInfo, String> {
    log::info!("Fetching info for package: {}", package_name);

    let scoop_dir = utils::resolve_scoop_root(app)?;
    let (manifest_path, bucket_name) =
        utils::locate_package_manifest(&scoop_dir, &package_name, None)?;

    let manifest_content = fs::read_to_string(&manifest_path)
        .map_err(|e| format!("Failed to read manifest for {}: {}", package_name, e))?;

    let json_value: Value = serde_json::from_str(&manifest_content)
        .map_err(|e| format!("Failed to parse JSON for {}: {}", package_name, e))?;

    let (mut details, notes) = parse_manifest_details(&json_value);

    details.push(("Bucket".to_string(), bucket_name));

    let installed_dir = scoop_dir.join("apps").join(&package_name).join("current");
    if installed_dir.exists() {
        details.push((
            "Installed".to_string(),
            installed_dir.to_string_lossy().to_string(),
        ));
        
        // Read the installed manifest to get the actual installed version
        let installed_manifest_path = installed_dir.join("manifest.json");
        if let Ok(installed_manifest_content) = fs::read_to_string(&installed_manifest_path) {
            if let Ok(installed_manifest) = serde_json::from_str::<Value>(&installed_manifest_content) {
                if let Some(installed_version) = installed_manifest.get("version").and_then(|v| v.as_str()) {
                    // Replace the version in details with the installed version, or add it if not present
                    if let Some(pos) = details.iter().position(|(key, _)| key == "Version") {
                        details[pos] = ("Installed Version".to_string(), installed_version.to_string());
                        // Also add the latest version from the bucket manifest
                        if let Some(latest_version) = json_value.get("version").and_then(|v| v.as_str()) {
                            if installed_version != latest_version {
                                details.push(("Latest Version".to_string(), latest_version.to_string()));
                            }
                        }
                    } else {
                        details.push(("Installed Version".to_string(), installed_version.to_string()));
                    }
                }
            }
        }
    }

    details.sort_by(|a, b| a.0.cmp(&b.0));

    // Prepend the package name to the details list for consistent display order.
    let mut ordered_details = vec![("Name".to_string(), package_name.clone())];
    ordered_details.append(&mut details);

    log::info!("Successfully fetched info for {}", package_name);
    Ok(ScoopInfo {
        details: ordered_details,
        notes,
    })
}

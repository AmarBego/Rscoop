use serde::Serialize;
use serde_json::Value;
use std::fs;
use crate::utils;
use tauri::{AppHandle, Runtime};

#[derive(Serialize, Debug, Clone, Default)]
pub struct ScoopInfo {
    pub details: Vec<(String, String)>,
    pub notes: Option<String>,
}

#[tauri::command]
pub fn get_package_info<R: Runtime>(
    app: AppHandle<R>,
    package_name: String,
) -> Result<ScoopInfo, String> {
    log::info!("Fetching info for package: {}", package_name);

    let scoop_dir = utils::find_scoop_dir(app)?;
    let (manifest_path, bucket_name) =
        utils::find_package_manifest(&scoop_dir, &package_name, None)?;

    let manifest_content = fs::read_to_string(&manifest_path)
        .map_err(|e| format!("Failed to read manifest for {}: {}", package_name, e))?;

    let json_value: Value = serde_json::from_str(&manifest_content)
        .map_err(|e| format!("Failed to parse JSON for {}: {}", package_name, e))?;

    let mut notes_value: Option<String> = None;
    let mut other_fields: Vec<(String, String)> = vec![];

    if let Some(obj) = json_value.as_object() {
        for (key, value) in obj {
            let value_str = match value {
                Value::String(s) => s.clone(),
                Value::Array(arr) => arr
                    .iter()
                    .map(|v| v.to_string().trim_matches('"').to_string())
                    .collect::<Vec<_>>()
                    .join(", "),
                _ => value.to_string().trim_matches('"').to_string(),
            };

            if key == "notes" {
                notes_value = Some(value_str);
            } else {
                let mut c = key.chars();
                let cap_key = match c.next() {
                    None => String::new(),
                    Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
                };
                other_fields.push((cap_key, value_str));
            }
        }
    }

    other_fields.push(("Bucket".to_string(), bucket_name));

    let installed_dir = scoop_dir.join("apps").join(&package_name).join("current");
    if installed_dir.exists() {
        other_fields.push((
            "Installed".to_string(),
            installed_dir.to_string_lossy().to_string(),
        ));
    }

    other_fields.sort_by(|a, b| a.0.cmp(&b.0));

    let mut ordered_fields = Vec::new();
    ordered_fields.push(("Name".to_string(), package_name.clone()));
    ordered_fields.append(&mut other_fields);

    log::info!("Successfully fetched info for {}", package_name);
    Ok(ScoopInfo {
        details: ordered_fields,
        notes: notes_value,
    })
} 
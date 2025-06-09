use serde::Serialize;
use serde_json::Value;
use crate::commands::powershell;

#[derive(Serialize, Debug, Clone, Default)]
pub struct ScoopInfo {
    pub details: Vec<(String, String)>,
    pub notes: Option<String>,
}

#[tauri::command]
pub async fn get_package_info(package_name: String) -> Result<ScoopInfo, String> {
    log::info!("Fetching info for package: {}", package_name);

    let command_str = format!("scoop info {} | ConvertTo-Json", package_name);

    let output = powershell::execute_command(&command_str)
        .await
        .map_err(|e| format!("Failed to execute scoop info: {}", e))?;

    if !output.status.success() {
        let error_message = String::from_utf8_lossy(&output.stderr);
        log::error!(
            "Scoop info command failed for {}: {}",
            package_name,
            error_message
        );
        return Err(format!(
            "Failed to get info for {}: {}",
            package_name, error_message
        ));
    }

    let output_str = String::from_utf8_lossy(&output.stdout);
    
    let json_start = output_str.find('{').unwrap_or(0);
    let json_str = &output_str[json_start..];

    let json_value: Value = serde_json::from_str(json_str)
        .map_err(|e| format!("Failed to parse JSON for {}: {}", package_name, e))?;

    let mut all_fields: Vec<(String, String)> = vec![];
    if let Some(obj) = json_value.as_object() {
        for (key, value) in obj {
            let value_str = match value {
                Value::String(s) => s.clone(),
                Value::Object(o) => {
                    if let Some(date_time) = o.get("DateTime").and_then(Value::as_str) {
                        date_time.to_string()
                    } else {
                        serde_json::to_string(o).unwrap_or_default()
                    }
                }
                _ => value.to_string().trim_matches('"').to_string(),
            };
            all_fields.push((key.clone(), value_str));
        }
    }
    
    let mut name_field: Option<(String, String)> = None;
    let mut notes_value: Option<String> = None;
    let mut other_fields: Vec<(String, String)> = vec![];

    for field in all_fields {
        if field.0 == "Name" {
            name_field = Some(field);
        } else if field.0 == "Notes" {
            notes_value = Some(field.1);
        } else {
            other_fields.push(field);
        }
    }

    other_fields.sort_by(|a, b| a.0.cmp(&b.0));

    let mut ordered_fields = Vec::new();
    if let Some(name) = name_field {
        ordered_fields.push(name);
    }
    ordered_fields.append(&mut other_fields);
    
    log::info!("Successfully fetched info for {}", package_name);
    Ok(ScoopInfo {
        details: ordered_fields,
        notes: notes_value,
    })
} 
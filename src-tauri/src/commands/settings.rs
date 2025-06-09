use crate::commands::powershell;

#[tauri::command]
pub async fn get_config_value(key: String) -> Result<String, String> {
    log::info!("Getting config value for key: {}", key);
    let command_str = format!("scoop config {}", key);
    let output = powershell::execute_command(&command_str)
        .await
        .map_err(|e| format!("Failed to execute 'scoop config get': {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // It's not an error if the key just isn't set, stderr will be empty.
        // If there's actual error output, return it.
        if !stderr.is_empty() {
            log::error!("'scoop config get' failed for {}: {}", key, stderr);
            return Err(format!("Failed to get config for {}: {}", key, stderr));
        }
    }

    let value = String::from_utf8(output.stdout)
        .map_err(|e| format!("Failed to parse config value: {}", e))?
        .trim()
        .to_string();

    Ok(value)
}

#[tauri::command]
pub async fn set_config_value(key: String, value: String) -> Result<(), String> {
    log::info!("Setting config value for key: {}", key);
    let command_str = format!("scoop config {} {}", key, value);
    let output = powershell::execute_command(&command_str)
        .await
        .map_err(|e| format!("Failed to execute 'scoop config set': {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        log::error!("'scoop config set' failed for {}: {}", key, stderr);
        return Err(format!("Failed to set config for {}: {}", key, stderr));
    }

    Ok(())
} 
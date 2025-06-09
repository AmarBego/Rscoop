use crate::commands::powershell;

#[tauri::command]
pub async fn get_package_manifest(package_name: String, package_source: String) -> Result<String, String> {
    log::info!("Fetching manifest for package: {} from bucket {}", package_name, package_source);

    let command_str = if !package_source.is_empty() && package_source != "None" {
        format!("scoop cat {}/{}", package_source, package_name)
    } else {
        format!("scoop cat {}", package_name)
    };

    log::info!("Executing command: {}", &command_str);

    let output = powershell::execute_command(&command_str)
        .await
        .map_err(|e| {
            let err_msg = format!("Failed to execute 'scoop cat': {}", e);
            log::error!("{}", err_msg);
            err_msg
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let err_msg = format!("'scoop cat' command failed for {}: {}", package_name, stderr);
        log::error!("{}", err_msg);
        return Err(err_msg);
    }

    let manifest_content = String::from_utf8(output.stdout)
        .map_err(|e| {
            let err_msg = format!("Failed to read manifest content for {}: {}", package_name, e);
            log::error!("{}", err_msg);
            err_msg
        })?;

    Ok(manifest_content)
} 
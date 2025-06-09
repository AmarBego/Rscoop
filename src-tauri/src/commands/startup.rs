use crate::commands::powershell;

#[tauri::command]
pub async fn check_sfsu_installed() -> Result<bool, String> {
    log::info!("Checking if sfsu is installed.");
    // A lightweight command to check if sfsu exists.
    let output = powershell::execute_command("sfsu --version").await;
    
    match output {
        Ok(output) => {
            if output.status.success() {
                log::info!("sfsu is installed.");
                Ok(true)
            } else {
                log::warn!("sfsu check command ran but was not successful. It's likely not installed.");
                Ok(false)
            }
        },
        Err(e) => {
            // This error likely means the 'sfsu' command was not found at all.
            log::warn!("sfsu check command failed to execute, probably not installed: {}", e);
            Ok(false)
        }
    }
} 
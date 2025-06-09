use serde::{Deserialize, Serialize};
use crate::commands::powershell;

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
pub struct ScoopPackage {
    pub name: String,
    pub version: String,
    pub source: String,
    pub updated: String,
    pub is_installed: bool,
    pub info: String,
}

#[derive(Deserialize, Debug, Clone)]
struct SfsuInstalledPackage {
    name: String,
    version: String,
    source: String,
    updated: Option<String>,
    info: Option<String>,
}

#[tauri::command]
pub async fn get_installed_packages_full() -> Result<Vec<ScoopPackage>, String> {
    log::info!("Fetching installed packages using sfsu");
    
    let output = powershell::execute_command("sfsu list --json")
        .await
        .map_err(|e| format!("Failed to execute sfsu list: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        log::error!("sfsu list command failed: {}", stderr);
        return Ok(vec![]);
    }

    let output_str = String::from_utf8_lossy(&output.stdout);

    if output_str.trim().is_empty() {
        return Ok(vec![]);
    }
    
    let sfsu_packages: Vec<SfsuInstalledPackage> = serde_json::from_str(&output_str)
        .map_err(|e| {
            let msg = format!("Failed to parse sfsu list JSON: {}. Output was: {}", e, output_str);
            log::error!("{}", msg);
            msg
        })?;

    let packages: Vec<ScoopPackage> = sfsu_packages
        .into_iter()
        .map(|p| ScoopPackage {
            name: p.name,
            version: p.version,
            source: p.source,
            updated: p.updated.unwrap_or_default(),
            is_installed: true,
            info: p.info.unwrap_or_default(),
        })
        .collect();
    
    log::info!("Found {} installed packages", packages.len());
    Ok(packages)
} 
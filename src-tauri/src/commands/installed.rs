use serde::Serialize;
use std::collections::HashSet;
use tokio::process::Command;

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
pub struct ScoopPackage {
    pub name: String,
    pub version: String,
    pub source: String,
    pub updated: String,
    pub is_installed: bool,
    pub info: String,
}

pub async fn get_installed_packages() -> Result<HashSet<String>, String> {
    log::info!("Executing command: scoop list");
    let output = Command::new("powershell")
        .args(["-Command", "scoop", "list"])
        .output()
        .await
        .map_err(|e| format!("Failed to execute scoop list: {}", e))?;

    if !output.status.success() {
        return Ok(HashSet::new()); // Return empty set if command fails
    }

    let output_str = String::from_utf8_lossy(&output.stdout);

    let installed: HashSet<String> = output_str
        .lines()
        .skip_while(|l| !l.starts_with("---"))
        .skip(1)
        .filter_map(|line| line.split_whitespace().next().map(ToString::to_string))
        .collect();

    log::info!("Found {} installed packages", installed.len());
    Ok(installed)
}

#[tauri::command]
pub async fn get_installed_packages_full() -> Result<Vec<ScoopPackage>, String> {
    log::info!("Fetching installed packages");
    
    let output = Command::new("powershell")
        .args(["-Command", "scoop", "list"])
        .output()
        .await
        .map_err(|e| format!("Failed to execute scoop list: {}", e))?;

    if !output.status.success() {
        log::error!("Scoop list command failed");
        return Ok(vec![]);
    }

    let output_str = String::from_utf8_lossy(&output.stdout);
    
    let packages: Vec<ScoopPackage> = output_str
        .lines()
        .skip_while(|l| !l.starts_with("---"))
        .skip(1)
        .filter_map(|line| {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() < 5 {
                return None;
            }

            let name = parts[0];
            
            Some(ScoopPackage {
                name: name.to_string(),
                version: parts[1].to_string(),
                source: parts[2].to_string(),
                updated: format!("{} {}", parts[3], parts[4]),
                is_installed: true,  // Always true for installed packages
                info: if parts.len() > 5 {
                    parts[5..].join(" ")
                } else {
                    "".to_string()
                },
            })
        })
        .collect();
    
    log::info!("Found {} installed packages", packages.len());
    Ok(packages)
} 
use crate::commands::installed::ScoopPackage;
use serde::Deserialize;
use std::collections::HashMap;
use crate::commands::powershell;

#[derive(Deserialize, Debug, Clone)]
struct SfsuPackage {
    name: String,
    bucket: String,
    version: String,
    installed: bool,
    bins: Option<Vec<String>>,
}

#[tauri::command]
pub async fn search_scoop(term: String) -> Result<Vec<ScoopPackage>, String> {
    log::info!("Searching for term: '{}'", term);
    if term.is_empty() {
        return Ok(vec![]);
    }

    let lower_term = term.to_lowercase();

    // In PowerShell, single quotes must be escaped by doubling them up for command strings.
    let sanitized_term = term.replace('\'', "''");
    let command_str = format!("sfsu search --mode both '{sanitized_term}' --json");

    log::info!("Executing command: {}", &command_str);

    let output = powershell::execute_command(&command_str)
        .await
        .map_err(|e| {
            let msg = format!("Failed to execute sfsu search: {}", e);
            log::error!("{}", msg);
            msg
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        log::warn!("sfsu search command failed. Stderr: {}", stderr);
        // It could be that no packages were found.
        return Ok(vec![]);
    }

    let search_output = String::from_utf8_lossy(&output.stdout);
    if search_output.trim().is_empty() {
        return Ok(vec![]);
    }

    log::debug!("sfsu search output: {}", search_output);

    let search_results: HashMap<String, Vec<SfsuPackage>> =
        serde_json::from_str(&search_output).map_err(|e| {
            let msg = format!("Failed to parse sfsu search JSON: {}", e);
            log::error!("{}. Output was: {}", msg, search_output);
            msg
        })?;

    let mut packages = Vec::new();

    for (_bucket, sfsu_packages) in search_results {
        for sfsu_pkg in sfsu_packages {
            let lower_name = sfsu_pkg.name.to_lowercase();
            let is_name_match = lower_name.contains(&lower_term);

            if is_name_match {
                packages.push(ScoopPackage {
                    name: sfsu_pkg.name,
                    version: sfsu_pkg.version,
                    source: sfsu_pkg.bucket,
                    is_installed: sfsu_pkg.installed,
                    updated: "".to_string(),
                    info: "".to_string(),
                });
            } else if let Some(bins) = &sfsu_pkg.bins {
                if let Some(matching_bin) = bins.iter().find(|b| {
                    let bin_filename = std::path::Path::new(b)
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or(b);
                    bin_filename.to_lowercase().contains(&lower_term)
                }) {
                    packages.push(ScoopPackage {
                        name: sfsu_pkg.name,
                        version: sfsu_pkg.version,
                        source: sfsu_pkg.bucket,
                        is_installed: sfsu_pkg.installed,
                        updated: "".to_string(),
                        info: format!("includes {}", matching_bin),
                    });
                }
            }
        }
    }

    log::info!("Parsed {} packages from search output", packages.len());
    Ok(packages)
} 
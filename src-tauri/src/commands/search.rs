use std::collections::HashSet;
use tokio::process::Command;
use crate::commands::installed::{get_installed_packages, ScoopPackage};

fn parse_scoop_search_output(
    output: &str,
    installed: &HashSet<String>,
) -> Vec<ScoopPackage> {
    let mut packages = Vec::new();
    let mut current_bucket = String::new();

    for line in output.lines() {
        if line.trim().is_empty() {
            continue;
        }

        if line.ends_with(" bucket:") {
            current_bucket = line.trim_end_matches(" bucket:").trim_matches('\'').to_string();
        } else if line.starts_with("    ") {
            let content = line.trim();
            
            let (package_part, info_part) = content.split_once(" --> includes ")
                .map(|(p, i)| (p, Some(i)))
                .unwrap_or((content, None));
            
            if let Some(version_start) = package_part.rfind(" (") {
                if let Some(version_end) = package_part.rfind(')') {
                     if version_start < version_end {
                        let name = package_part[..version_start].trim().to_string();
                        let version = package_part[version_start + 2..version_end].to_string();

                        let info = info_part.map_or("".to_string(), |s| format!("includes {}", s));
                        
                        let package = ScoopPackage {
                            name: name.clone(),
                            version,
                            source: current_bucket.clone(),
                            is_installed: installed.contains(&name),
                            updated: "".to_string(),
                            info,
                        };
                        packages.push(package);
                     }
                }
            }
        }
    }
    packages
}

#[tauri::command]
pub async fn search_scoop(term: String) -> Result<Vec<ScoopPackage>, String> {
    log::info!("Searching for term: '{}'", term);
    if term.is_empty() {
        return Ok(vec![]);
    }

    let installed_packages_future = get_installed_packages();

    log::info!("Executing command: scoop search {}", &term);
    let search_output_future = Command::new("powershell")
        .args(["-Command", "scoop-search.exe", &term])
        .output();

    let (installed_packages_result, search_output_result) =
        tokio::join!(installed_packages_future, search_output_future);

    let installed_packages = installed_packages_result.unwrap_or_else(|e| {
        log::error!("Failed to get installed packages: {}", e);
        HashSet::new()
    });

    let output = search_output_result.map_err(|e| {
        log::error!("Failed to execute scoop search: {}", e);
        format!("Failed to execute scoop search: {}", e)
    })?;

    log::info!(
        "Scoop search command exited with status: {}",
        output.status
    );

    if !output.status.success() {
        log::warn!(
            "Scoop search was not successful. Stderr: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        // scoop search exits with non-zero if no packages are found
        return Ok(vec![]);
    }

    let search_output = String::from_utf8_lossy(&output.stdout);
    log::debug!("Scoop search output:\n{}", search_output);
    let packages = parse_scoop_search_output(&search_output, &installed_packages);
    log::info!("Parsed {} packages from search output", packages.len());

    Ok(packages)
} 
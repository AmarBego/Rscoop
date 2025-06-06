use serde::Serialize;
use std::collections::HashSet;
use tokio::process::Command;

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
pub struct ScoopPackage {
    name: String,
    version: String,
    source: String,
    is_installed: bool,
    info: String,
}

async fn get_installed_packages() -> Result<HashSet<String>, String> {
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
    let mut installed = HashSet::new();

    // Skip header lines by finding the separator line like "----"
    let lines = output_str.lines().skip_while(|l| !l.starts_with("---")).skip(1);
    for line in lines {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if let Some(name) = parts.get(0) {
            if !name.is_empty() {
                installed.insert(name.to_string());
            }
        }
    }
    log::info!("Found {} installed packages", installed.len());
    Ok(installed)
}

fn parse_scoop_search_output(
    output: &str,
    installed: &HashSet<String>,
) -> Vec<ScoopPackage> {
    let mut packages = Vec::new();
    // Skip header lines by finding the separator line like "----"
    let lines = output.lines().skip_while(|l| !l.starts_with("---")).skip(1);

    for line in lines {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 3 {
            let name = parts[0].to_string();
            let version = parts[1].to_string();
            let source = parts[2].to_string();

            let info = if parts.len() > 3 {
                parts[3..].join(" ")
            } else {
                "".to_string()
            };

            let pkg = ScoopPackage {
                name: name.clone(),
                version,
                source,
                is_installed: installed.contains(&name),
                info,
            };
            packages.push(pkg);
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

    let installed_packages = get_installed_packages().await.unwrap_or_else(|e| {
        log::error!("Failed to get installed packages: {}", e);
        HashSet::new()
    });

    let command_str = format!("scoop search {}", term);
    log::info!("Executing command: {}", &command_str);
    let output = Command::new("powershell")
        .args(["-Command", "scoop", "search", &term])
        .output()
        .await
        .map_err(|e| {
            log::error!("Failed to execute scoop search: {}", e);
            format!("Failed to execute scoop search: {}", e)
        })?;

    log::info!(
        "Scoop search command exited with status: {}",
        output.status
    );

    if !output.status.success() {
        log::warn!("Scoop search was not successful. Stderr: {}", String::from_utf8_lossy(&output.stderr));
        // scoop search exits with non-zero if no packages are found
        return Ok(vec![]);
    }

    let search_output = String::from_utf8_lossy(&output.stdout);
    log::debug!("Scoop search output:\n{}", search_output);
    let packages = parse_scoop_search_output(&search_output, &installed_packages);
    log::info!("Parsed {} packages from search output", packages.len());

    Ok(packages)
} 
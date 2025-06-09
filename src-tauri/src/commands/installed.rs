use crate::utils;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use tauri::{AppHandle, Runtime};

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
pub enum MatchSource {
    Name,
    Binary,
    None,
}

impl Default for MatchSource {
    fn default() -> Self {
        MatchSource::None
    }
}

#[derive(Serialize, Debug, Clone, PartialEq, Eq, Default)]
pub struct ScoopPackage {
    pub name: String,
    pub version: String,
    pub source: String,
    pub updated: String,
    pub is_installed: bool,
    pub info: String,
    #[serde(default)]
    pub match_source: MatchSource,
}

#[derive(Deserialize, Debug)]
struct Manifest {
    description: String,
    version: String,
}

#[derive(Deserialize, Debug)]
struct InstallManifest {
    bucket: String,
}

#[tauri::command]
pub async fn get_installed_packages_full<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Vec<ScoopPackage>, String> {
    log::info!("Fetching installed packages from filesystem");

    let scoop_path = match utils::find_scoop_dir(app.clone()) {
        Ok(path) => path,
        Err(e) => {
            log::error!("Failed to find scoop directory: {}", e);
            return Err(e);
        }
    };

    let apps_path = scoop_path.join("apps");

    if !apps_path.is_dir() {
        log::warn!(
            "Scoop apps directory does not exist at: {}",
            apps_path.display()
        );
        return Ok(vec![]);
    }

    let mut packages = vec![];

    let app_dirs = match fs::read_dir(apps_path) {
        Ok(dirs) => dirs,
        Err(e) => {
            let msg = format!("Failed to read apps directory: {}", e);
            log::error!("{}", msg);
            return Err(msg);
        }
    };

    for entry in app_dirs.filter_map(Result::ok) {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let package_name = match path.file_name().and_then(|n| n.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };

        let current_path = path.join("current");

        let manifest_path = current_path.join("manifest.json");
        let install_manifest_path = current_path.join("install.json");

        if !manifest_path.is_file() || !install_manifest_path.is_file() {
            continue;
        }

        let manifest_content = match fs::read_to_string(&manifest_path) {
            Ok(content) => content,
            Err(_) => continue,
        };
        let manifest: Manifest = match serde_json::from_str(&manifest_content) {
            Ok(m) => m,
            Err(_) => continue,
        };

        let install_manifest_content = match fs::read_to_string(&install_manifest_path) {
            Ok(content) => content,
            Err(_) => continue,
        };
        let install_manifest: InstallManifest =
            match serde_json::from_str(&install_manifest_content) {
                Ok(im) => im,
                Err(_) => continue,
            };

        let updated_time = fs::metadata(&install_manifest_path)
            .and_then(|m| m.modified())
            .map(|t| DateTime::<Utc>::from(t).to_rfc3339())
            .unwrap_or_else(|_| "".to_string());

        packages.push(ScoopPackage {
            name: package_name,
            version: manifest.version,
            source: install_manifest.bucket,
            updated: updated_time,
            is_installed: true,
            info: manifest.description,
            ..Default::default()
        });
    }

    log::info!("Found {} installed packages", packages.len());
    Ok(packages)
} 
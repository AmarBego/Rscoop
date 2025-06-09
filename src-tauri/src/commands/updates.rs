use crate::commands::installed::{get_installed_packages_full, ScoopPackage as InstalledPackage};
use crate::utils::{find_package_manifest, find_scoop_dir};
use serde::{Deserialize, Serialize};
use std::fs;
use tauri::{AppHandle, Runtime};

#[derive(Serialize, Debug)]
pub struct UpdatablePackage {
    pub name: String,
    pub current: String,
    pub available: String,
}

#[derive(Deserialize, Debug)]
struct Manifest {
    version: String,
}

async fn get_latest_version<R: Runtime>(
    _app: AppHandle<R>,
    scoop_dir: &std::path::Path,
    package: &InstalledPackage,
) -> Option<String> {
    if let Ok((manifest_path, _)) =
        find_package_manifest(scoop_dir, &package.name, Some(package.source.clone()))
    {
        if let Ok(content) = fs::read_to_string(manifest_path) {
            if let Ok(manifest) = serde_json::from_str::<Manifest>(&content) {
                return Some(manifest.version);
            }
        }
    }
    None
}

#[tauri::command]
pub async fn check_for_updates<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Vec<UpdatablePackage>, String> {
    log::info!("Checking for updates using filesystem");
    let scoop_dir = find_scoop_dir(app.clone())?;
    let installed_packages = get_installed_packages_full(app.clone()).await?;

    let mut updatable_packages = vec![];
    let held_packages = crate::commands::hold::list_held_packages(app.clone()).await?;

    for package in installed_packages {
        if held_packages.contains(&package.name) {
            continue;
        }
        if let Some(latest_version) =
            get_latest_version(app.clone(), &scoop_dir, &package).await
        {
            if package.version != latest_version {
                updatable_packages.push(UpdatablePackage {
                    name: package.name.clone(),
                    current: package.version.clone(),
                    available: latest_version,
                });
            }
        }
    }

    log::info!("Found {} updatable packages", updatable_packages.len());
    Ok(updatable_packages)
} 
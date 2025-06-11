//! The main checkup command module.
//!
//! This command is a reimplementation of the `sfsu checkup` command.
//! We are grateful to the SFSU team for their original work and logic.
//! Original source: https://github.com/winpax/sfsu/blob/trunk/src/commands/checkup.rs

use crate::commands::powershell::create_powershell_command;
use crate::utils;
use serde::Serialize;
use std::path::Path;
use tauri::{AppHandle, Runtime};

// Import Windows-specific checks only on Windows.
#[cfg(windows)]
use super::windows_checks;

/// Represents the result of a single checkup item.
#[derive(Serialize, Debug, Clone)]
pub struct CheckupItem {
    /// An optional ID, used for identifying specific items like missing helpers.
    pub id: Option<String>,
    /// The status of the check, `true` for success/pass, `false` for failure/warning.
    pub status: bool,
    /// A descriptive text of what was checked.
    pub text: String,
    /// An optional suggestion for the user to fix a failed check.
    pub suggestion: Option<String>,
}

/// Checks if Git is installed and available in the PATH.
async fn check_git_installed() -> CheckupItem {
    let git_installed = create_powershell_command("git --version")
        .output()
        .await
        .is_ok();

    CheckupItem {
        id: None,
        status: git_installed,
        text: "Git is installed".to_string(),
        suggestion: if git_installed {
            None
        } else {
            Some(
                "Scoop relies on Git. Please install it, for example by running: scoop install git"
                    .to_string(),
            )
        },
    }
}

/// Checks if the main Scoop bucket is installed.
fn check_main_bucket_installed(scoop_path: &Path) -> CheckupItem {
    let main_bucket_installed = scoop_path.join("buckets").join("main").is_dir();
    CheckupItem {
        id: None,
        status: main_bucket_installed,
        text: "Main bucket is installed".to_string(),
        suggestion: if main_bucket_installed {
            None
        } else {
            Some(
                "The main bucket is essential for many packages. To add it, run: scoop bucket add main"
                    .to_string(),
            )
        },
    }
}

/// Checks for missing recommended helper packages.
fn check_missing_helpers(scoop_path: &Path) -> Vec<CheckupItem> {
    const HELPERS: &[&str] = &["7zip", "dark", "innounp", "lessmsi"];
    let apps_path = scoop_path.join("apps");

    HELPERS
        .iter()
        .map(|&helper| {
            let is_installed = apps_path.join(helper).join("current").exists();
            CheckupItem {
                id: if is_installed {
                    None
                } else {
                    Some(helper.to_string())
                },
                status: is_installed,
                text: format!("Helper '{}' is installed", helper),
                suggestion: if is_installed {
                    None
                } else {
                    Some(format!(
                        "This helper is recommended. Install it with: scoop install {}",
                        helper
                    ))
                },
            }
        })
        .collect()
}

/// Runs the Scoop checkup process, performing various system checks.
#[tauri::command]
pub async fn run_scoop_checkup<R: Runtime>(app: AppHandle<R>) -> Result<Vec<CheckupItem>, String> {
    log::info!("Running native system checkup");

    let scoop_path = utils::resolve_scoop_root(app)?;

    // Run the async git check concurrently with the sync checks.
    let git_check_future = check_git_installed();

    // Run synchronous checks.
    let mut items = vec![];
    items.push(check_main_bucket_installed(&scoop_path));

    // Add Windows-specific checks.
    #[cfg(windows)]
    {
        items.push(windows_checks::check_windows_developer_mode());
        items.push(windows_checks::check_long_paths_enabled());
        items.push(windows_checks::check_scoop_on_ntfs(&scoop_path));
    }

    items.extend(check_missing_helpers(&scoop_path));

    // Await the async check and prepend its result to the list.
    let git_check_result = git_check_future.await;
    items.insert(0, git_check_result);

    Ok(items)
}
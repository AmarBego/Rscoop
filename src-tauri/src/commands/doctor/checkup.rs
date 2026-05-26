//! The main checkup command module.
//!
//! This command is a reimplementation of the `sfsu checkup` command.
//! We are grateful to the SFSU team for their original work and logic.
//! Original source: https://github.com/winpax/sfsu/blob/trunk/src/commands/checkup.rs

use crate::state::AppState;
use execra::tauri::ExecraExt;
use serde::Serialize;
use std::path::Path;
use tauri::{AppHandle, State};

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
    /// Optional structured action the frontend can render as a one-click fix.
    pub fix: Option<CheckupFix>,
}

#[derive(Serialize, Debug, Clone)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum CheckupFix {
    InstallPackage {
        label: String,
        package: String,
    },
    InstallBucket {
        label: String,
        name: String,
        url: String,
    },
    OpenSettings {
        label: String,
        page: String,
    },
}

impl CheckupFix {
    fn install_package(package: impl Into<String>) -> Self {
        let package = package.into();
        Self::InstallPackage {
            label: format!("Install {}", package),
            package,
        }
    }
}

/// Checks if Git is installed and available in the PATH.
async fn check_git_installed(app: AppHandle) -> CheckupItem {
    let git_installed = app
        .execra()
        .task(execra::Command::new("git").arg("--version"))
        .label("Checking Git")
        .await
        .is_success();

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
        fix: if git_installed {
            None
        } else {
            Some(CheckupFix::install_package("git"))
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
        fix: if main_bucket_installed {
            None
        } else {
            Some(CheckupFix::InstallBucket {
                label: "Add main bucket".to_string(),
                name: "main".to_string(),
                url: "https://github.com/ScoopInstaller/Main".to_string(),
            })
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
                fix: if is_installed {
                    None
                } else {
                    Some(CheckupFix::install_package(helper))
                },
            }
        })
        .collect()
}

#[tauri::command]
pub fn open_windows_settings_page(page: String) -> Result<(), String> {
    let uri = match page.as_str() {
        "developers" => "ms-settings:developers",
        "disks-and-volumes" => "ms-settings:disksandvolumes",
        _ => return Err(format!("Unsupported Windows Settings page: {}", page)),
    };

    #[cfg(windows)]
    {
        std::process::Command::new("explorer.exe")
            .arg(uri)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("Failed to open Windows Settings: {}", e))
    }

    #[cfg(not(windows))]
    {
        let _ = uri;
        Err("Windows Settings pages can only be opened on Windows".to_string())
    }
}

/// Runs the Scoop checkup process, performing various system checks.
#[tauri::command]
pub async fn run_scoop_checkup(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<CheckupItem>, String> {
    log::info!("Running native system checkup");

    let scoop_path = state.scoop_path();

    // Run the async git check concurrently with the sync checks.
    let git_check_future = check_git_installed(app);

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

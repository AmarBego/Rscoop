// This command is a reimplementation of the `sfsu checkup` command.
// We are grateful to the SFSU team for their original work and logic.
// Original source: https://github.com/winpax/sfsu/blob/trunk/src/commands/checkup.rs

use crate::utils;
use serde::Serialize;
use std::path::Path;
use std::process::Command;
use tauri::{AppHandle, Runtime};

#[cfg(windows)]
use winreg::enums::*;
#[cfg(windows)]
use winreg::RegKey;

#[derive(Serialize, Debug, Clone)]
pub struct CheckupItem {
    pub id: Option<String>,
    pub status: bool,
    pub text: String,
    pub suggestion: Option<String>,
}

fn check_git_installed() -> CheckupItem {
    let git_installed = Command::new("git").arg("--version").output().is_ok();
    CheckupItem {
        id: None,
        status: git_installed,
        text: "Git is installed".to_string(),
        suggestion: if git_installed {
            None
        } else {
            Some("Scoop relies on Git. Please install it, for example by running: scoop install git".to_string())
        },
    }
}

fn check_main_bucket_installed(scoop_path: &Path) -> CheckupItem {
    let main_bucket_installed = scoop_path.join("buckets").join("main").is_dir();
    CheckupItem {
        id: None,
        status: main_bucket_installed,
        text: "Main bucket is installed".to_string(),
        suggestion: if main_bucket_installed {
            None
        } else {
            Some("The main bucket is essential for many packages. To add it, run: scoop bucket add main".to_string())
        },
    }
}

#[cfg(windows)]
fn check_windows_developer_mode() -> CheckupItem {
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let key_path = r"SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock";
    let suggestion = Some("Windows Developer Mode is not enabled. Operations relevant to symlinks may fail without proper rights. Please enable it in the Windows Settings.".to_string());

    let status = match hklm.open_subkey(key_path) {
        Ok(key) => match key.get_value::<u32, _>("AllowDevelopmentWithoutDevLicense") {
            Ok(value) => value == 1,
            Err(_) => false,
        },
        Err(_) => false,
    };

    CheckupItem {
        id: None,
        status,
        text: "Windows Developer Mode is enabled".to_string(),
        suggestion: if status { None } else { suggestion },
    }
}

#[cfg(windows)]
fn check_long_paths_enabled() -> CheckupItem {
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let key_path = r"SYSTEM\CurrentControlSet\Control\FileSystem";
    let suggestion = Some("Enable long paths by running this command in an administrator PowerShell: Set-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\FileSystem' -Name 'LongPathsEnabled' -Value 1".to_string());

    let status = match hklm.open_subkey(key_path) {
        Ok(key) => match key.get_value::<u32, _>("LongPathsEnabled") {
            Ok(value) => value == 1,
            Err(_) => false,
        },
        Err(_) => false,
    };

    CheckupItem {
        id: None,
        status,
        text: "Long paths are enabled".to_string(),
        suggestion: if status { None } else { suggestion },
    }
}

#[cfg(windows)]
fn get_filesystem_type(path: &Path) -> Result<String, String> {
    use std::os::windows::prelude::OsStrExt;
    use windows_sys::Win32::{
        Foundation::MAX_PATH,
        Storage::FileSystem::{GetVolumeInformationW, GetVolumePathNameW},
    };

    let path_ws: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    let mut volume_path_buf = vec![0u16; MAX_PATH as usize];

    unsafe {
        if GetVolumePathNameW(
            path_ws.as_ptr(),
            volume_path_buf.as_mut_ptr(),
            volume_path_buf.len() as u32,
        ) == 0
        {
            return Err(std::io::Error::last_os_error().to_string());
        }
    }

    let mut fs_name_buf = vec![0u16; MAX_PATH as usize];
    unsafe {
        if GetVolumeInformationW(
            volume_path_buf.as_ptr(),
            std::ptr::null_mut(),
            0,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            fs_name_buf.as_mut_ptr(),
            fs_name_buf.len() as u32,
        ) == 0
        {
            return Err(std::io::Error::last_os_error().to_string());
        }
    }
    
    let fs_name_nul_pos = fs_name_buf.iter().position(|&c| c == 0).unwrap_or(fs_name_buf.len());
    Ok(String::from_utf16_lossy(&fs_name_buf[..fs_name_nul_pos]))
}

#[cfg(windows)]
fn check_scoop_on_ntfs(scoop_path: &Path) -> CheckupItem {
    let fs_type = get_filesystem_type(scoop_path).unwrap_or_else(|e| {
        log::error!("Failed to get filesystem type: {}", e);
        "Unknown".to_string()
    });
    let is_ntfs = fs_type.eq_ignore_ascii_case("NTFS");
    CheckupItem {
        id: None,
        status: is_ntfs,
        text: format!("Scoop is on an NTFS filesystem (found: {})", fs_type),
        suggestion: if is_ntfs {
            None
        } else {
            Some("Scoop requires an NTFS volume to work properly. Please ensure the Scoop directory is on an NTFS partition.".to_string())
        },
    }
}

fn check_missing_helpers(scoop_path: &Path) -> Vec<CheckupItem> {
    const HELPERS: &[&str] = &["7zip", "dark", "innounp", "lessmsi"];
    let apps_path = scoop_path.join("apps");

    HELPERS.iter().map(|&helper| {
        let is_installed = apps_path.join(helper).join("current").exists();
        CheckupItem {
            id: if is_installed { None } else { Some(helper.to_string()) },
            status: is_installed,
            text: format!("Helper '{}' is installed", helper),
            suggestion: if is_installed {
                None
            } else {
                Some(format!("This helper is recommended. Install it with: scoop install {}", helper))
            }
        }
    }).collect()
}


#[tauri::command]
pub async fn run_sfsu_checkup<R: Runtime>(app: AppHandle<R>) -> Result<Vec<CheckupItem>, String> {
    log::info!("Running native system checkup");
    let mut items = vec![];

    let scoop_path = match utils::find_scoop_dir(app) {
        Ok(path) => path,
        Err(e) => return Err(e),
    };

    items.push(check_git_installed());
    items.push(check_main_bucket_installed(&scoop_path));
    
    // Windows-specific checks
    #[cfg(windows)]
    {
        items.push(check_windows_developer_mode());
        items.push(check_long_paths_enabled());
        items.push(check_scoop_on_ntfs(&scoop_path));
    }

    items.extend(check_missing_helpers(&scoop_path));

    Ok(items)
} 
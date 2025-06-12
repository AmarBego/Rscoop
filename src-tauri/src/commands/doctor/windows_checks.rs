//! Windows-specific checkup functions for the doctor command.
//!
//! This module contains checks that are specific to the Windows operating system,
//! such as verifying registry keys and filesystem properties.

use super::checkup::CheckupItem;
use std::path::Path;

#[cfg(windows)]
use winreg::{enums::*, RegKey};

/// Checks if Windows Developer Mode is enabled by querying the registry.
#[cfg(windows)]
pub fn check_windows_developer_mode() -> CheckupItem {
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let key_path = r"SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock";
    let suggestion = Some("Windows Developer Mode is not enabled. Operations relevant to symlinks may fail without proper rights. Please enable it in the Windows Settings.".to_string());

    let status = match hklm.open_subkey(key_path) {
        Ok(key) => key
            .get_value::<u32, _>("AllowDevelopmentWithoutDevLicense")
            .map_or(false, |v| v == 1),
        Err(_) => false,
    };

    CheckupItem {
        id: None,
        status,
        text: "Windows Developer Mode is enabled".to_string(),
        suggestion: if status { None } else { suggestion },
    }
}

/// Checks if long paths are enabled in the Windows registry.
#[cfg(windows)]
pub fn check_long_paths_enabled() -> CheckupItem {
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let key_path = r"SYSTEM\CurrentControlSet\Control\FileSystem";
    let suggestion = Some("Enable long paths by running this command in an administrator PowerShell: Set-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\FileSystem' -Name 'LongPathsEnabled' -Value 1".to_string());

    let status = match hklm.open_subkey(key_path) {
        Ok(key) => key
            .get_value::<u32, _>("LongPathsEnabled")
            .map_or(false, |v| v == 1),
        Err(_) => false,
    };

    CheckupItem {
        id: None,
        status,
        text: "Long paths are enabled".to_string(),
        suggestion: if status { None } else { suggestion },
    }
}

/// Retrieves the filesystem type (e.g., "NTFS") for a given path.
///
/// This function uses Windows-specific APIs to determine the filesystem.
///
/// # Safety
/// This function uses `unsafe` blocks to call Windows API functions. It is assumed
/// that the provided path is valid and that the buffer sizes are sufficient.
#[cfg(windows)]
fn get_filesystem_type(path: &Path) -> Result<String, String> {
    use std::os::windows::prelude::OsStrExt;
    use windows_sys::Win32::{
        Foundation::MAX_PATH,
        Storage::FileSystem::{GetVolumeInformationW, GetVolumePathNameW},
    };

    // Convert the path to a null-terminated wide string (UTF-16) for the Windows API.
    let path_ws: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    let mut volume_path_buf = vec![0u16; MAX_PATH as usize];

    // Get the volume path name for the given file/directory path.
    // This is the root of the volume, e.g., "C:\".
    let result = unsafe {
        GetVolumePathNameW(
            path_ws.as_ptr(),
            volume_path_buf.as_mut_ptr(),
            volume_path_buf.len() as u32,
        )
    };

    if result == 0 {
        return Err(format!(
            "GetVolumePathNameW failed with error: {}",
            std::io::Error::last_os_error()
        ));
    }

    let mut fs_name_buf = vec![0u16; MAX_PATH as usize];
    // Get volume information, including the filesystem name (e.g., "NTFS").
    let result = unsafe {
        GetVolumeInformationW(
            volume_path_buf.as_ptr(),
            std::ptr::null_mut(),
            0,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            fs_name_buf.as_mut_ptr(),
            fs_name_buf.len() as u32,
        )
    };

    if result == 0 {
        return Err(format!(
            "GetVolumeInformationW failed with error: {}",
            std::io::Error::last_os_error()
        ));
    }

    // Convert the resulting wide string buffer to a Rust String.
    let fs_name_nul_pos = fs_name_buf
        .iter()
        .position(|&c| c == 0)
        .unwrap_or(fs_name_buf.len());
    Ok(String::from_utf16_lossy(&fs_name_buf[..fs_name_nul_pos]))
}

/// Checks if the Scoop installation directory is on an NTFS filesystem.
#[cfg(windows)]
pub fn check_scoop_on_ntfs(scoop_path: &Path) -> CheckupItem {
    let fs_type = match get_filesystem_type(scoop_path) {
        Ok(fs) => fs,
        Err(e) => {
            log::error!("Failed to get filesystem type: {}", e);
            "Unknown".to_string()
        }
    };

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

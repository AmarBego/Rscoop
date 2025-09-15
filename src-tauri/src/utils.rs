use crate::commands::settings;
use std::env;
use std::path::PathBuf;
use std::fs;
use tauri::{AppHandle, Runtime};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[derive(Debug, Clone)]
pub struct ScoopAppShortcut {
    pub name: String,
    pub display_name: String,
    pub target_path: String,
    pub working_directory: String,
    pub icon_path: Option<String>,
}

/// Checks if the application is installed via Scoop
pub fn is_scoop_installation() -> bool {
    if let Ok(exe_path) = env::current_exe() {
        let path_str = exe_path.to_string_lossy().to_lowercase();
        path_str.contains("scoop") && path_str.contains("apps") && path_str.contains("rscoop")
    } else {
        false
    }
}

/// Resolve the root directory of Scoop on the host machine.
///
/// The resolution strategy is:
/// 1. Use the user-defined path stored in settings (highest precedence).
/// 2. Inspect the `SCOOP` environment variable.
/// 3. Default to `%USERPROFILE%\\scoop`.
/// 4. Fallback to the system-wide `C:\\ProgramData\\scoop` location.
///
/// A detailed log entry is written at every decision point so that problems
/// can be diagnosed from the unified application log.
///
/// # Errors
/// Returns `Err` with a human-readable message if no valid directory could be
/// located.
pub fn resolve_scoop_root<R: Runtime>(app: AppHandle<R>) -> Result<PathBuf, String> {
    // 1. Check the user-defined path from settings first
    if let Ok(Some(path_str)) = settings::get_scoop_path(app) {
        let path = PathBuf::from(path_str);
        if path.exists() && path.is_dir() {
            log::info!("Using user-defined scoop path: {}", path.display());
            return Ok(path);
        } else {
            log::warn!("User-defined scoop path is invalid: {}", path.display());
        }
    }

    // 2. Fallback to environment variable
    if let Ok(scoop_path) = env::var("SCOOP") {
        let path = PathBuf::from(scoop_path);
        if path.exists() {
            log::info!("Using SCOOP environment variable: {}", path.display());
            return Ok(path);
        }
    }

    // 3. Fallback to default user profile location
    if let Ok(user_profile) = env::var("USERPROFILE") {
        let scoop_path = PathBuf::from(user_profile).join("scoop");
        if scoop_path.exists() {
            log::info!("Using default user profile path: {}", scoop_path.display());
            return Ok(scoop_path);
        }
    }

    // 4. Fallback to system-wide location
    let program_data = PathBuf::from("C:\\ProgramData\\scoop");
    if program_data.exists() {
        log::info!("Using system-wide path: {}", program_data.display());
        return Ok(program_data);
    }

    Err(
        "Unable to determine Scoop root directory. Please configure it explicitly in Settings."
            .to_string(),
    )
}

// -----------------------------------------------------------------------------
// Manifest helpers
// -----------------------------------------------------------------------------

/// Locate a manifest file for `package_name` within the Scoop buckets.
///
/// If `package_source` is supplied it will be treated as an exact bucket name
/// and only that bucket will be inspected. Otherwise all buckets are searched
/// in parallel and the first match is returned.
///
/// The returned tuple contains the fully qualified path to the manifest file
/// and the bucket name the manifest originated from.
///
/// # Errors
/// Propagates any I/O failure and returns a domain-specific error when the
/// manifest cannot be located.
pub fn locate_package_manifest(
    scoop_dir: &std::path::Path,
    package_name: &str,
    package_source: Option<String>,
) -> Result<(PathBuf, String), String> {
    locate_package_manifest_impl(scoop_dir, package_name, package_source)
}

// Internal implementation that contains the previous logic. This avoids code
// duplication while giving us the opportunity to phase out the old API.
fn locate_package_manifest_impl(
    scoop_dir: &std::path::Path,
    package_name: &str,
    package_source: Option<String>,
) -> Result<(PathBuf, String), String> {
    let buckets_dir = scoop_dir.join("buckets");

    if !buckets_dir.is_dir() {
        return Err("Scoop 'buckets' directory not found.".to_string());
    }

    let search_buckets = |bucket_path: PathBuf| -> Result<(PathBuf, String), String> {
        if bucket_path.is_dir() {
            let bucket_name = bucket_path
                .file_name()
                .unwrap()
                .to_string_lossy()
                .to_string();

            let manifest_filename = format!("{}.json", package_name);

            let manifest_path = bucket_path.join(&manifest_filename);
            if manifest_path.exists() {
                return Ok((manifest_path, bucket_name));
            }

            let nested_manifest_path = bucket_path.join("bucket").join(&manifest_filename);
            if nested_manifest_path.exists() {
                return Ok((nested_manifest_path, bucket_name));
            }
        }
        Err(format!("Package '{}' not found.", package_name))
    };

    if let Some(source) = package_source {
        if !source.is_empty() && source != "None" {
            let specific_bucket_path = buckets_dir.join(&source);
            return search_buckets(specific_bucket_path).map_err(|_| {
                format!(
                    "Package '{}' not found in bucket '{}'.",
                    package_name, source
                )
            });
        }
    }

    for entry in std::fs::read_dir(buckets_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if let Ok(found) = search_buckets(entry.path()) {
            return Ok(found);
        }
    }

    Err(format!(
        "Package '{}' not found in any bucket.",
        package_name
    ))
}

// -----------------------------------------------------------------------------
// Scoop Apps Shortcuts helpers
// -----------------------------------------------------------------------------

/// Scans the Windows Start Menu for Scoop Apps shortcuts
/// 
/// Returns a list of shortcuts found in %AppData%\Microsoft\Windows\Start Menu\Programs\Scoop Apps
pub fn get_scoop_app_shortcuts() -> Result<Vec<ScoopAppShortcut>, String> {
    let app_data = env::var("APPDATA").map_err(|_| "Could not find APPDATA environment variable")?;
    let scoop_apps_path = PathBuf::from(app_data)
        .join("Microsoft")
        .join("Windows")
        .join("Start Menu")
        .join("Programs")
        .join("Scoop Apps");

    log::info!("Scanning for Scoop Apps shortcuts in: {}", scoop_apps_path.display());

    if !scoop_apps_path.exists() {
        log::warn!("Scoop Apps directory not found: {}", scoop_apps_path.display());
        return Ok(Vec::new());
    }

    let mut shortcuts = Vec::new();

    for entry in fs::read_dir(&scoop_apps_path).map_err(|e| format!("Failed to read Scoop Apps directory: {}", e))? {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        if path.extension().and_then(|s| s.to_str()) == Some("lnk") {
            if let Some(file_stem) = path.file_stem().and_then(|s| s.to_str()) {
                if let Ok(shortcut_info) = parse_shortcut(&path) {
                    shortcuts.push(ScoopAppShortcut {
                        name: file_stem.to_string(),
                        display_name: file_stem.replace("_", " ").to_string(),
                        target_path: shortcut_info.target_path,
                        working_directory: shortcut_info.working_directory,
                        icon_path: shortcut_info.icon_path,
                    });
                } else {
                    log::warn!("Failed to parse shortcut: {}", path.display());
                }
            }
        }
    }

    log::info!("Found {} Scoop Apps shortcuts", shortcuts.len());
    Ok(shortcuts)
}

#[derive(Debug)]
struct ShortcutInfo {
    target_path: String,
    working_directory: String,
    icon_path: Option<String>,
}

/// Parse a Windows .lnk shortcut file to extract target and working directory
/// This is a simplified parser that extracts basic information
#[cfg(windows)]
fn parse_shortcut(path: &PathBuf) -> Result<ShortcutInfo, String> {
    use std::process::{Command, Stdio};

    // Use PowerShell to parse the shortcut file
    let ps_script = format!(
        r#"
        try {{
            $shell = New-Object -ComObject WScript.Shell
            $shortcut = $shell.CreateShortcut('{}')
            $result = @{{
                'TargetPath' = $shortcut.TargetPath
                'WorkingDirectory' = $shortcut.WorkingDirectory
                'IconLocation' = $shortcut.IconLocation
            }}
            $result | ConvertTo-Json -Compress
        }} catch {{
            Write-Error $_.Exception.Message
            exit 1
        }}
        "#,
        path.display().to_string().replace("'", "''")
    );

    let mut cmd = Command::new("powershell");
    cmd.args([
        "-NoProfile",
        "-NoLogo", 
        "-NonInteractive",
        "-WindowStyle", "Hidden",
        "-ExecutionPolicy", "Bypass",
        "-Command",
        &ps_script,
    ])
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());

    // Prevents a console window from appearing on Windows.
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW

    let output = cmd.output()
        .map_err(|e| format!("Failed to execute PowerShell: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "PowerShell failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let json_str = String::from_utf8_lossy(&output.stdout);
    let json_value: serde_json::Value = serde_json::from_str(&json_str)
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;

    let target_path = json_value["TargetPath"]
        .as_str()
        .unwrap_or("")
        .to_string();
    let working_directory = json_value["WorkingDirectory"]
        .as_str()
        .unwrap_or("")
        .to_string();
    let icon_location = json_value["IconLocation"]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());

    Ok(ShortcutInfo {
        target_path,
        working_directory,
        icon_path: icon_location,
    })
}

#[cfg(not(windows))]
fn parse_shortcut(_path: &PathBuf) -> Result<ShortcutInfo, String> {
    Err("Shortcut parsing is only supported on Windows".to_string())
}

/// Launch a Scoop app using its target path
pub fn launch_scoop_app(target_path: &str, working_directory: &str) -> Result<(), String> {
    log::info!("Launching app: {} from {}", target_path, working_directory);

    #[cfg(windows)]
    {
        use std::process::Command;
        
        let mut cmd = Command::new(target_path);
        
        if !working_directory.is_empty() {
            cmd.current_dir(working_directory);
        }
        
        cmd.spawn()
            .map_err(|e| format!("Failed to launch app: {}", e))?;
        
        Ok(())
    }
    
    #[cfg(not(windows))]
    {
        Err("App launching is only supported on Windows".to_string())
    }
}

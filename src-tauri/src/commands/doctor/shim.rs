//! Commands for managing Scoop shims.
use crate::utils;
use once_cell::sync::Lazy;
use rayon::prelude::*;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Runtime};

/// Represents a Scoop shim, providing details about its configuration and source.
#[derive(Serialize, Debug, Clone, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub struct Shim {
    name: String,
    path: String,
    source: String,
    shim_type: String,
    args: Option<String>,
    is_global: bool,
    is_hidden: bool,
}

/// Defines the arguments required for adding a new shim.
#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AddShimArgs {
    name: String,
    path: String,
    args: Option<String>,
    global: bool,
}

// Statically compiled regex for parsing shim files efficiently.
static PATH_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r#"path\s*=\s*['"](.*?)['"]"#).unwrap());
static ARGS_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r#"args\s*=\s*(.*)"#).unwrap());
static SOURCE_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"[\\/]apps[\\/]([^\\/]+)[\\/]").unwrap());

/// Parses the content of a `.shim` file to extract the target path and arguments.
fn parse_shim_file_content(content: &str) -> (Option<String>, Option<String>) {
    let path = PATH_RE
        .captures(content)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string());
    let args = ARGS_RE
        .captures(content)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().trim().to_string());
    (path, args)
}

/// Parses a directory entry to create a `Shim` struct.
fn parse_shim_from_entry(entry: &fs::DirEntry, is_global: bool) -> Option<Shim> {
    let path = entry.path();
    let name = path.file_stem()?.to_str()?.to_string();

    let shim_file_path = path.with_extension("shim");
    let (target_path, shim_type, source, args) = if shim_file_path.exists() {
        let content = fs::read_to_string(&shim_file_path).unwrap_or_default();
        let (path_opt, args_opt) = parse_shim_file_content(&content);
        let path = path_opt.unwrap_or_else(|| "Invalid Path".into());

        let source = SOURCE_RE
            .captures(&path)
            .and_then(|c| c.get(1))
            .map_or_else(|| "Custom".to_string(), |m| m.as_str().to_string());

        let shim_type = if args_opt.is_some() {
            "Executable with args".to_string()
        } else {
            "Executable".to_string()
        };
        (path, shim_type, source, args_opt)
    } else {
        let path_str = path.to_string_lossy().to_string();
        let shim_type = match path.extension().and_then(|s| s.to_str()) {
            Some("ps1") => "PowerShell Script".to_string(),
            Some("cmd") | Some("bat") => "Batch Script".to_string(),
            _ => "Unknown".to_string(),
        };
        (path_str, shim_type, "Custom".to_string(), None)
    };

    let is_hidden = path.with_extension("exe.shimmed").exists();

    Some(Shim {
        name,
        path: target_path,
        source,
        shim_type,
        args,
        is_global,
        is_hidden,
    })
}

/// Processes a single shim directory (global or local) to find all shims.
fn process_shim_dir(dir: &Path, is_global: bool) -> Result<Vec<Shim>, String> {
    if !dir.is_dir() {
        return Ok(vec![]);
    }

    let entries = fs::read_dir(dir).map_err(|e| format!("Failed to read shim dir: {}", e))?;

    let shims: Vec<Shim> = entries
        .par_bridge()
        .filter_map(Result::ok)
        .filter(|entry| {
            let file_name = entry.file_name().to_string_lossy().to_string();
            !file_name.ends_with(".exe") && !file_name.ends_with(".exe.shimmed")
        })
        .filter_map(|entry| parse_shim_from_entry(&entry, is_global))
        .collect();

    Ok(shims)
}

/// Lists all Scoop shims from both local and global shim paths.
#[tauri::command]
pub async fn list_shims<R: Runtime>(app: AppHandle<R>) -> Result<Vec<Shim>, String> {
    log::info!("Listing shims from filesystem");
    let scoop_path = utils::resolve_scoop_root(app)?;

    let local_shims = process_shim_dir(&scoop_path.join("shims"), false)?;
    let global_shims = process_shim_dir(&scoop_path.join("global").join("shims"), true)?;

    let mut shim_set: HashSet<Shim> = local_shims.into_iter().collect();
    shim_set.extend(global_shims);

    let mut shims: Vec<Shim> = shim_set.into_iter().collect();
    shims.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    Ok(shims)
}

/// Hides or unhides a shim by renaming its executable.
#[tauri::command]
pub async fn alter_shim<R: Runtime>(app: AppHandle<R>, shim_name: String) -> Result<(), String> {
    log::info!("Altering shim '{}' on filesystem", shim_name);
    let scoop_path = utils::resolve_scoop_root(app)?;

    let attempt_rename = |dir: &Path| -> Result<bool, String> {
        if !dir.is_dir() {
            return Ok(false);
        }
        let exe = dir.join(format!("{}.exe", shim_name));
        let shimmed = dir.join(format!("{}.exe.shimmed", shim_name));

        if exe.exists() {
            fs::rename(&exe, &shimmed).map_err(|e| e.to_string())?;
            Ok(true)
        } else if shimmed.exists() {
            fs::rename(&shimmed, &exe).map_err(|e| e.to_string())?;
            Ok(true)
        } else {
            Ok(false)
        }
    };

    let was_altered = attempt_rename(&scoop_path.join("shims"))? 
        || attempt_rename(&scoop_path.join("global").join("shims"))?;

    if was_altered {
        Ok(())
    } else {
        Err(format!("Could not find a manageable shim for '{}'.", shim_name))
    }
}

/// Finds all files associated with a given shim name in both local and global paths.
fn find_shim_files(scoop_path: &Path, shim_name: &str) -> Result<Vec<PathBuf>, String> {
    let mut files = Vec::new();
    let shim_dirs = [
        scoop_path.join("shims"),
        scoop_path.join("global").join("shims"),
    ];

    for dir in shim_dirs.iter().filter(|d| d.is_dir()) {
        let entries = fs::read_dir(dir).map_err(|e| e.to_string())?;
        for entry in entries.filter_map(Result::ok) {
            if entry.file_name().to_string_lossy().starts_with(shim_name) {
                files.push(entry.path());
            }
        }
    }
    Ok(files)
}

/// Removes a shim and all its associated files.
#[tauri::command]
pub async fn remove_shim<R: Runtime>(app: AppHandle<R>, shim_name: String) -> Result<(), String> {
    log::info!("Removing shim '{}' from filesystem", shim_name);
    let scoop_path = utils::resolve_scoop_root(app)?;

    let files_to_remove = find_shim_files(&scoop_path, &shim_name)?;

    if files_to_remove.is_empty() {
        return Err(format!("Shim '{}' not found.", shim_name));
    }

    files_to_remove.par_iter().for_each(|path| {
        if let Err(e) = fs::remove_file(path) {
            log::error!("Failed to remove '{:?}': {}", path, e);
        }
    });

    Ok(())
}

/// Adds a new shim for a given executable path.
#[tauri::command]
pub async fn add_shim<R: Runtime>(app: AppHandle<R>, args: AddShimArgs) -> Result<(), String> {
    log::info!("Adding shim '{}' for path '{}'", args.name, args.path);
    let scoop_path = utils::resolve_scoop_root(app)?;

    let shims_dir = if args.global {
        scoop_path.join("global").join("shims")
    } else {
        scoop_path.join("shims")
    };

    fs::create_dir_all(&shims_dir)
        .map_err(|e| format!("Failed to create shims directory: {}", e))?;

    let shim_file_path = shims_dir.join(format!("{}.shim", args.name));
    let mut shim_content = format!("path = \"{}\"\n", args.path.replace('\\', "\\\\"));
    if let Some(shim_args) = &args.args {
        if !shim_args.is_empty() {
            shim_content.push_str(&format!("args = {}", shim_args));
        }
    }
    fs::write(&shim_file_path, shim_content)
        .map_err(|e| format!("Failed to write .shim file: {}", e))?;

    let shim_template_path = scoop_path.join("apps/scoop/current/shim.exe");
    if !shim_template_path.exists() {
        return Err(
            "Scoop's shim.exe template not found. Is Scoop installed correctly?".to_string(),
        );
    }
    let new_shim_exe_path = shims_dir.join(format!("{}.exe", args.name));
    fs::copy(&shim_template_path, &new_shim_exe_path)
        .map_err(|e| format!("Failed to copy shim executable: {}", e))?;

    Ok(())
}
 
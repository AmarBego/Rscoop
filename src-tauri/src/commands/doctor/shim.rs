use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime};
use crate::utils;
use std::fs;
use std::path::{Path, PathBuf};
use regex::Regex;
use std::collections::HashMap;

// For serializing `camelCase` data to the frontend.
#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
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

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AddShimArgs {
    name: String,
    path: String,
    args: Option<String>,
    global: bool,
}

// Helper to parse a .shim file's contents for path and args.
fn parse_shim_file_content(content: &str) -> (Option<String>, Option<String>) {
    let path_re = Regex::new(r#"path\s*=\s*['"](.*?)['"]"#).unwrap();
    let args_re = Regex::new(r#"args\s*=\s*(.*)"#).unwrap();

    let path = path_re.captures(content).and_then(|c| c.get(1)).map(|m| m.as_str().to_string());
    let args = args_re.captures(content).and_then(|c| c.get(1)).map(|m| m.as_str().trim().to_string());
    
    (path, args)
}

#[tauri::command]
pub async fn list_shims<R: Runtime>(app: AppHandle<R>) -> Result<Vec<Shim>, String> {
    log::info!("Listing shims from filesystem");
    let scoop_path = utils::find_scoop_dir(app).map_err(|e| e.to_string())?;
    
    let mut shim_map: HashMap<String, Shim> = HashMap::new();

    let process_dir = |dir: &Path, is_global: bool, shim_map: &mut HashMap<String, Shim>| -> Result<(), String> {
        if !dir.exists() { return Ok(()); }
        let entries = dir.read_dir().map_err(|e| format!("Failed to read shim dir: {}", e))?;
        
        for entry in entries.filter_map(Result::ok) {
            let path = entry.path();
            let file_name = path.file_name().and_then(|s| s.to_str()).unwrap_or("").to_string();

            if file_name.ends_with(".exe") || file_name.ends_with(".exe.shimmed") {
                continue;
            }

            let name = path.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_string();
            if name.is_empty() || shim_map.contains_key(&name) {
                continue;
            }

            let shim_file_path = dir.join(format!("{}.shim", name));
            let (target_path, shim_type, source, args) = if shim_file_path.exists() {
                let content = fs::read_to_string(&shim_file_path).unwrap_or_default();
                let (path_opt, args_opt) = parse_shim_file_content(&content);
                let path = path_opt.unwrap_or_else(|| "Invalid Path".into());

                let source = if let Ok(re) = Regex::new(r"[\\/]apps[\\/]([^\\/]+)[\\/]") {
                    re.captures(&path).and_then(|c| c.get(1)).map_or("Custom".to_string(), |m| m.as_str().to_string())
                } else { "Custom".to_string() };

                let shim_type = if args_opt.is_some() { "Executable with args".to_string() } else { "Executable".to_string() };
                (path, shim_type, source, args_opt)
            } else {
                let path = path.to_string_lossy().to_string();
                let shim_type = match path.rsplit('.').next() {
                    Some("ps1") => "PowerShell Script".to_string(),
                    Some("cmd") | Some("bat") => "Batch Script".to_string(),
                    _ => "Unknown".to_string(),
                };
                (path, shim_type, "Custom".to_string(), None)
            };
            
            let is_hidden = dir.join(format!("{}.exe.shimmed", name)).exists();

            shim_map.insert(name.clone(), Shim {
                name,
                path: target_path,
                source,
                shim_type,
                args,
                is_global,
                is_hidden,
            });
        }
        Ok(())
    };

    process_dir(&scoop_path.join("shims"), false, &mut shim_map)?;
    process_dir(&scoop_path.join("global").join("shims"), true, &mut shim_map)?;

    let mut shims: Vec<Shim> = shim_map.into_values().collect();
    shims.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    Ok(shims)
}


#[tauri::command]
pub async fn alter_shim<R: Runtime>(app: AppHandle<R>, shim_name: String) -> Result<(), String> {
    log::info!("Altering shim '{}' on filesystem", shim_name);
    let scoop_path = utils::find_scoop_dir(app).map_err(|e| e.to_string())?;

    let attempt_rename_in = |dir: PathBuf| -> Result<bool, String> {
        if !dir.exists() { return Ok(false); }
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
    
    let was_altered = attempt_rename_in(scoop_path.join("shims"))? 
        || attempt_rename_in(scoop_path.join("global").join("shims"))?;

    if was_altered { Ok(()) } else { Err(format!("Could not find a manageable shim for '{}'.", shim_name)) }
}


#[tauri::command]
pub async fn remove_shim<R: Runtime>(app: AppHandle<R>, shim_name: String) -> Result<(), String> {
    log::info!("Removing shim '{}' from filesystem", shim_name);
    let scoop_path = utils::find_scoop_dir(app).map_err(|e| e.to_string())?;
    
    let mut found = false;
    let shim_dirs = [scoop_path.join("shims"), scoop_path.join("global").join("shims")];

    for dir in shim_dirs.iter().filter(|d| d.exists()) {
        let read_dir = dir.read_dir().map_err(|e| e.to_string())?;
        for entry in read_dir.filter_map(Result::ok) {
            let path = entry.path();
            if path.file_stem().map_or(false, |s| s == shim_name.as_str()) {
                fs::remove_file(&path).map_err(|e| format!("Failed to remove '{:?}': {}", path, e))?;
                found = true;
            }
        }
    }

    if found { Ok(()) } else { Err(format!("Shim '{}' not found.", shim_name)) }
}


#[tauri::command]
pub async fn add_shim<R: Runtime>(app: AppHandle<R>, args: AddShimArgs) -> Result<(), String> {
    log::info!("Adding shim '{}' for path '{}'", args.name, args.path);
    let scoop_path = utils::find_scoop_dir(app).map_err(|e| e.to_string())?;

    let shims_dir = if args.global {
        scoop_path.join("global").join("shims")
    } else {
        scoop_path.join("shims")
    };

    fs::create_dir_all(&shims_dir).map_err(|e| format!("Failed to create shims directory: {}", e))?;

    // Create .shim file
    let shim_file_path = shims_dir.join(format!("{}.shim", args.name));
    let mut shim_content = format!("path = \"{}\"\n", args.path);
    if let Some(shim_args) = &args.args {
        if !shim_args.is_empty() {
            shim_content.push_str(&format!("args = {}", shim_args));
        }
    }
    fs::write(&shim_file_path, shim_content).map_err(|e| format!("Failed to write .shim file: {}", e))?;

    // Copy shim executable from scoop's template
    let shim_template_path = scoop_path.join("apps/scoop/current/shim.exe");
    if !shim_template_path.exists() {
        return Err("Scoop's shim.exe template not found. Is Scoop installed correctly?".to_string());
    }
    let new_shim_exe_path = shims_dir.join(format!("{}.exe", args.name));
    fs::copy(&shim_template_path, &new_shim_exe_path)
        .map_err(|e| format!("Failed to copy shim executable: {}", e))?;
    
    Ok(())
} 
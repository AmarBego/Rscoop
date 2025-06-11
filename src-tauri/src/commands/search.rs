//! Commands for searching Scoop packages.
use crate::commands::installed::get_installed_packages_full;
use crate::models::{MatchSource, ScoopPackage, SearchResult};
use crate::utils;
use once_cell::sync::Lazy;
use rayon::prelude::*;
use regex::Regex;
use serde_json::Value;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

// Global cache for manifest paths to avoid re-scanning the filesystem on every search.
static MANIFEST_CACHE: Lazy<Mutex<Option<HashSet<PathBuf>>>> = Lazy::new(|| Mutex::new(None));

/// Finds all `.json` manifest files in a given bucket's `bucket` subdirectory.
fn find_manifests_in_bucket(bucket_path: PathBuf) -> Vec<PathBuf> {
    let manifests_path = bucket_path.join("bucket");
    if !manifests_path.is_dir() {
        return vec![];
    }

    match std::fs::read_dir(manifests_path) {
        Ok(entries) => entries
            .filter_map(Result::ok)
            .filter(|entry| {
                entry.path().extension().and_then(|s| s.to_str()) == Some("json")
            })
            .map(|entry| entry.path())
            .collect(),
        Err(_) => vec![],
    }
}

/// Scans all bucket directories to find package manifests and populates the cache.
fn populate_manifest_cache(scoop_path: &Path) -> Result<HashSet<PathBuf>, String> {
    let buckets_path = scoop_path.join("buckets");
    if !buckets_path.is_dir() {
        return Err("Scoop buckets directory not found".to_string());
    }

    let manifest_paths = std::fs::read_dir(&buckets_path)
        .map_err(|e| format!("Failed to read buckets directory: {}", e))?
        .par_bridge()
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_dir())
        .flat_map(|entry| find_manifests_in_bucket(entry.path()))
        .collect::<HashSet<PathBuf>>();

    Ok(manifest_paths)
}

/// Acquires a lock on the manifest cache and populates it if it's empty.
fn get_manifests<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<(HashSet<PathBuf>, bool), String> {
    let mut guard = MANIFEST_CACHE.lock().unwrap();
    let is_cold = guard.is_none();

    if is_cold {
        log::info!("Cold search: Populating manifest cache.");
        let scoop_path = utils::resolve_scoop_root(app)?;
        let paths = populate_manifest_cache(&scoop_path)?;
        *guard = Some(paths.clone());
        Ok((paths, true))
    } else {
        Ok((guard.as_ref().unwrap().clone(), false))
    }
}

/// Parses a Scoop package manifest file to extract package information.
fn parse_package_from_manifest(path: &Path) -> Option<ScoopPackage> {
    let file_name = path.file_stem().and_then(|s| s.to_str())?.to_string();

    let content = std::fs::read_to_string(path).ok()?;
    let json: Value = serde_json::from_str(&content).ok()?;

    let version = json.get("version").and_then(|v| v.as_str())?.to_string();
    let bucket = path.parent()?.parent()?.file_name()?.to_str()?.to_string();

    Some(ScoopPackage {
        name: file_name,
        version,
        source: bucket,
        match_source: MatchSource::Name,
        ..Default::default()
    })
}

/// Builds a regex pattern for searching, supporting exact and partial matches.
fn build_search_regex(term: &str) -> Result<Regex, String> {
    let trimmed = term.trim();
    let pattern_str = if trimmed.starts_with('"') && trimmed.ends_with('"') && trimmed.len() > 1 {
        // Exact match: "term"
        let inner = &trimmed[1..trimmed.len() - 1];
        let normalized = inner.trim().replace(' ', "-");
        format!("(?i)^{}$", regex::escape(&normalized))
    } else {
        // Partial match: term
        let normalized = trimmed.replace(' ', "-");
        format!("(?i){}", regex::escape(&normalized))
    };

    Regex::new(&pattern_str).map_err(|e| e.to_string())
}

/// Searches for Scoop packages based on a search term.
#[tauri::command]
pub async fn search_scoop<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    term: String,
) -> Result<SearchResult, String> {
    if term.is_empty() {
        return Ok(SearchResult::default());
    }

    log::info!("Searching for term: '{}'", term);

    let (manifest_paths, is_cold) = get_manifests(app.clone())?;
    let pattern = build_search_regex(&term)?;

    let mut packages: Vec<ScoopPackage> = manifest_paths
        .par_iter()
        .filter_map(|path| {
            // Check if the file name (package name) matches first
            let file_name = path.file_stem().and_then(|s| s.to_str())?;
            let name_matches = pattern.is_match(file_name);

            // Determine if the search term matches one of the binaries declared in the manifest.
            // We only do this expensive parse if the package name itself did **not** match.
            let match_source = if name_matches {
                MatchSource::Name
            } else {
                // Load and inspect the manifest's `bin` field
                let content = std::fs::read_to_string(path).ok()?;
                let json: Value = serde_json::from_str(&content).ok()?;

                let does_bin_match = json.get("bin").map_or(false, |bin_val| {
                    match bin_val {
                        Value::String(s) => pattern.is_match(s),
                        Value::Array(arr) => arr.iter().any(|entry| match entry {
                            Value::String(s) => pattern.is_match(s),
                            Value::Object(obj) => {
                                // Some manifests use object syntax { "alias": "path/to/file" }
                                obj.keys().any(|k| pattern.is_match(k)) || obj.values().any(|v| v.as_str().map_or(false, |s| pattern.is_match(s)))
                            }
                            _ => false,
                        }),
                        Value::Object(obj) => {
                            // Very uncommon, but treat similarly to array/object case
                            obj.keys().any(|k| pattern.is_match(k)) || obj.values().any(|v| v.as_str().map_or(false, |s| pattern.is_match(s)))
                        }
                        _ => false,
                    }
                });

                if does_bin_match {
                    MatchSource::Binary
                } else {
                    MatchSource::None
                }
            };

            if match_source == MatchSource::None {
                return None;
            }

            let mut pkg = parse_package_from_manifest(path)?;
            pkg.match_source = match_source;
            Some(pkg)
        })
        .collect();

    // Determine which of the found packages are already installed.
    if let Ok(installed_pkgs) = get_installed_packages_full(app).await {
        let installed_set: HashSet<String> = installed_pkgs
            .into_iter()
            .map(|p| p.name.to_lowercase())
            .collect();

        for pkg in &mut packages {
            if installed_set.contains(&pkg.name.to_lowercase()) {
                pkg.is_installed = true;
            }
        }
    }

    log::info!("Found {} packages matching '{}'", packages.len(), term);

    Ok(SearchResult {
        packages,
        is_cold,
    })
}
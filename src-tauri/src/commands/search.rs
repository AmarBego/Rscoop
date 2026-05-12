//! Commands for searching Scoop packages.
use crate::commands::installed::get_installed_packages_full;
use crate::models::{MatchSource, ScoopPackage, SearchResult};
use crate::state::AppState;
use once_cell::sync::Lazy;
use rayon::prelude::*;
use regex::Regex;
use serde_json::Value;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use tauri::Manager;
use tokio::sync::Mutex;

#[derive(Clone, Debug)]
pub struct CachedManifest {
    pub package: ScoopPackage,
    pub bin_strings: Vec<String>,
}

// Global cache for manifest content to avoid re-scanning the filesystem and re-parsing JSON on every search.
static MANIFEST_CACHE: Lazy<Mutex<Option<Vec<CachedManifest>>>> = Lazy::new(|| Mutex::new(None));

/// Finds all `.json` manifest files in a given bucket's `bucket` subdirectory.
fn find_manifests_in_bucket(bucket_path: PathBuf) -> Vec<PathBuf> {
    let manifests_path = bucket_path.join("bucket");
    if !manifests_path.is_dir() {
        return vec![];
    }

    match std::fs::read_dir(manifests_path) {
        Ok(entries) => entries
            .filter_map(Result::ok)
            .filter(|entry| entry.path().extension().and_then(|s| s.to_str()) == Some("json"))
            .map(|entry| entry.path())
            .collect(),
        Err(_) => vec![],
    }
}

/// Parses a Scoop package manifest file to extract package information and binary search strings.
fn parse_package_from_manifest(path: &Path) -> Option<CachedManifest> {
    let file_name = path.file_stem().and_then(|s| s.to_str())?.to_string();

    let content = std::fs::read_to_string(path).ok()?;
    let json: Value = serde_json::from_str(&content).ok()?;

    let version = json.get("version").and_then(|v| v.as_str())?.to_string();
    let bucket = path.parent()?.parent()?.file_name()?.to_str()?.to_string();

    let package = ScoopPackage {
        name: file_name,
        version,
        source: bucket,
        match_source: MatchSource::Name,
        ..Default::default()
    };

    // Pre-extract all potential binary match strings
    let mut bin_strings = Vec::new();
    if let Some(bin_val) = json.get("bin") {
        match bin_val {
            Value::String(s) => bin_strings.push(s.to_string()),
            Value::Array(arr) => {
                for entry in arr {
                    match entry {
                        Value::String(s) => bin_strings.push(s.to_string()),
                        Value::Object(obj) => {
                            for k in obj.keys() {
                                bin_strings.push(k.to_string());
                            }
                            for v in obj.values() {
                                if let Some(s) = v.as_str() {
                                    bin_strings.push(s.to_string());
                                }
                            }
                        }
                        _ => {}
                    }
                }
            }
            Value::Object(obj) => {
                for k in obj.keys() {
                    bin_strings.push(k.to_string());
                }
                for v in obj.values() {
                    if let Some(s) = v.as_str() {
                        bin_strings.push(s.to_string());
                    }
                }
            }
            _ => {}
        }
    }

    Some(CachedManifest { package, bin_strings })
}

/// Scans all bucket directories to find package manifests and populates the cache.
async fn populate_manifest_cache(scoop_path: &Path) -> Result<Vec<CachedManifest>, String> {
    let buckets_path = scoop_path.join("buckets");
    if !tokio::fs::try_exists(&buckets_path).await.unwrap_or(false) {
        return Err("Scoop buckets directory not found".to_string());
    }

    let mut read_dir = tokio::fs::read_dir(&buckets_path)
        .await
        .map_err(|e| format!("Failed to read buckets directory: {}", e))?;
    let mut manifest_paths = Vec::new();

    while let Ok(Some(entry)) = read_dir.next_entry().await {
        if entry.path().is_dir() {
            let bucket_manifests = find_manifests_in_bucket(entry.path());
            manifest_paths.extend(bucket_manifests);
        }
    }

    // Parse all manifests in parallel
    let cached_manifests = tokio::task::spawn_blocking(move || {
        manifest_paths
            .par_iter()
            .filter_map(|path| parse_package_from_manifest(path))
            .collect::<Vec<_>>()
    })
    .await
    .map_err(|e| e.to_string())?;

    Ok(cached_manifests)
}

/// Acquires a lock on the manifest cache and populates it if it's empty.
async fn get_manifests<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<(Vec<CachedManifest>, bool), String> {
    let mut guard = MANIFEST_CACHE.lock().await;
    let is_cold = guard.is_none();

    if is_cold {
        log::info!("Cold search: Populating manifest cache.");
        let state = app.state::<AppState>();
        let scoop_path = state.scoop_path();
        let cached = populate_manifest_cache(&scoop_path).await?;
        *guard = Some(cached.clone());
        Ok((cached, true))
    } else {
        Ok((guard.as_ref().unwrap().clone(), false))
    }
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

    log::info!("search_scoop: Starting search for term: '{}'", term);
    let search_start = std::time::Instant::now();

    let (manifests, is_cold) = get_manifests(app.clone()).await?;
    let cache_time = search_start.elapsed();

    if is_cold {
        log::warn!(
            "search_scoop: ⚠ Cache was cold! Had to populate manifest cache during search (took {:.2}s). This should not happen if cold-start completed.",
            cache_time.as_secs_f64()
        );
    } else {
        log::info!(
            "search_scoop: ✓ Using pre-warmed manifest cache ({} manifests, retrieved in {:.2}ms)",
            manifests.len(),
            cache_time.as_millis()
        );
    }

    let pattern = build_search_regex(&term)?;

    // Perform the search in memory
    let mut packages: Vec<ScoopPackage> = tokio::task::spawn_blocking(move || {
        manifests
            .par_iter()
            .filter_map(|cached| {
                let name_matches = pattern.is_match(&cached.package.name);

                let match_source = if name_matches {
                    MatchSource::Name
                } else {
                    let does_bin_match = cached.bin_strings.iter().any(|s| pattern.is_match(s));
                    if does_bin_match {
                        MatchSource::Binary
                    } else {
                        MatchSource::None
                    }
                };

                if match_source == MatchSource::None {
                    return None;
                }

                let mut pkg = cached.package.clone();
                pkg.match_source = match_source;
                Some(pkg)
            })
            .collect()
    })
    .await
    .map_err(|e| e.to_string())?;

    // Determine which of the found packages are already installed.
    let state = app.state::<AppState>();
    if let Ok(installed_pkgs) = get_installed_packages_full(app.clone(), state).await {
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

    let total_time = search_start.elapsed();
    log::info!(
        "search_scoop: ✓ Found {} packages matching '{}' in {:.2}s",
        packages.len(),
        term,
        total_time.as_secs_f64()
    );

    Ok(SearchResult { packages, is_cold })
}

/// Warms (populates) the global manifest cache if it is empty. Intended for use by the
/// cold-start routine so that the first search from the UI is instant.
///
/// Returns Ok(()) on success or an error string if the cache population failed.
pub async fn warm_manifest_cache<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<(), String> {
    log::info!("warm_manifest_cache: Starting manifest cache warm-up");
    let start_time = std::time::Instant::now();
    let result = get_manifests(app).await;
    let elapsed = start_time.elapsed();

    match result {
        Ok((paths, was_cold)) => {
            log::info!(
                "warm_manifest_cache: ✓ Cache warmed in {:.2}s - {} manifests loaded (was_cold: {})",
                elapsed.as_secs_f64(),
                paths.len(),
                was_cold
            );
            Ok(())
        }
        Err(e) => {
            log::error!(
                "warm_manifest_cache: ✗ Failed after {:.2}s - {}",
                elapsed.as_secs_f64(),
                e
            );
            Err(e)
        }
    }
}

/// Invalidates and immediately re-warms the global manifest cache.
/// This should be called after operations that change the available packages,
/// such as installing or uninstalling a package or adding/removing buckets.
pub async fn invalidate_manifest_cache(scoop_path: &Path) {
    let mut guard = MANIFEST_CACHE.lock().await;
    *guard = None;
    log::info!("Manifest cache invalidated, re-warming...");

    let start = std::time::Instant::now();
    match populate_manifest_cache(scoop_path).await {
        Ok(manifests) => {
            let count = manifests.len();
            *guard = Some(manifests);
            log::info!(
                "Manifest cache re-warmed in {:.2}s ({} manifests)",
                start.elapsed().as_secs_f64(),
                count
            );
        }
        Err(e) => {
            log::warn!("Failed to re-warm manifest cache: {}", e);
        }
    }
}

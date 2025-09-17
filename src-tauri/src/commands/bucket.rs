//! Command for managing Scoop buckets - repositories containing package manifests.
use crate::models::BucketInfo;
use crate::state::AppState;
use std::fs;
use std::path::Path;
use tauri::{AppHandle, Runtime, State};

/// Counts the number of manifest (.json) files in a bucket directory.
/// Handles both flat structure and bucket/ subdirectory structure.
/// Checks both root and bucket/ subdirectory as some buckets may have manifests in both locations.
fn count_manifests(bucket_path: &Path) -> u32 {
    let mut count = 0;

    // Check for manifests in the root of the bucket
    if let Ok(entries) = fs::read_dir(bucket_path) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("json") {
                // Skip certain files that aren't package manifests
                if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                    if !file_name.starts_with('.') && file_name != "bucket.json" {
                        count += 1;
                    }
                }
            }
        }
    }

    // Always check the bucket/ subdirectory as well (many buckets primarily use this structure)
    let bucket_subdir = bucket_path.join("bucket");
    if bucket_subdir.is_dir() {
        if let Ok(entries) = fs::read_dir(bucket_subdir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("json") {
                    count += 1;
                }
            }
        }
    }

    count
}

/// Checks if a directory is a Git repository by looking for .git directory.
fn is_git_repo(path: &Path) -> bool {
    path.join(".git").exists()
}

/// Attempts to read Git repository information from the .git directory.
fn get_git_info(bucket_path: &Path) -> (Option<String>, Option<String>) {
    let git_dir = bucket_path.join(".git");
    if !git_dir.exists() {
        return (None, None);
    }

    let mut git_url = None;
    let mut git_branch = None;

    // Try to read remote URL from .git/config
    let config_path = git_dir.join("config");
    if let Ok(config_content) = fs::read_to_string(config_path) {
        // Parse the config for remote origin URL
        for line in config_content.lines() {
            let line = line.trim();
            if line.starts_with("url = ") {
                git_url = Some(line.replace("url = ", "").trim().to_string());
                break;
            }
        }
    }

    // Try to read current branch from .git/HEAD
    let head_path = git_dir.join("HEAD");
    if let Ok(head_content) = fs::read_to_string(head_path) {
        let head_content = head_content.trim();
        if head_content.starts_with("ref: refs/heads/") {
            git_branch = Some(head_content.replace("ref: refs/heads/", ""));
        }
    }

    (git_url, git_branch)
}

/// Gets the last modified time of a directory.
fn get_last_updated(path: &Path) -> Option<String> {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .map(|t| {
            use chrono::{DateTime, Utc};
            DateTime::<Utc>::from(t)
                .format("%Y-%m-%d %H:%M:%S UTC")
                .to_string()
        })
        .ok()
}

/// Loads information for a single bucket from its directory.
fn load_bucket_info(bucket_path: &Path) -> Result<BucketInfo, String> {
    let bucket_name = bucket_path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| format!("Invalid bucket directory name: {:?}", bucket_path))?
        .to_string();

    if !bucket_path.is_dir() {
        return Err(format!("Bucket path is not a directory: {:?}", bucket_path));
    }

    let manifest_count = count_manifests(bucket_path);
    let is_git_repo = is_git_repo(bucket_path);
    let (git_url, git_branch) = if is_git_repo {
        get_git_info(bucket_path)
    } else {
        (None, None)
    };
    let last_updated = get_last_updated(bucket_path);

    Ok(BucketInfo {
        name: bucket_name,
        path: bucket_path.to_string_lossy().to_string(),
        manifest_count,
        is_git_repo,
        git_url,
        git_branch,
        last_updated,
    })
}

/// Fetches a list of all Scoop buckets by scanning the buckets directory.
#[tauri::command]
pub async fn get_buckets<R: Runtime>(
    _app: AppHandle<R>,
    state: State<'_, AppState>,
) -> Result<Vec<BucketInfo>, String> {
    log::info!("Fetching Scoop buckets from filesystem");

    let buckets_path = state.scoop_path.join("buckets");

    if !buckets_path.is_dir() {
        log::warn!(
            "Scoop buckets directory does not exist at: {}",
            buckets_path.display()
        );
        return Ok(vec![]);
    }

    let bucket_dirs = fs::read_dir(&buckets_path)
        .map_err(|e| format!("Failed to read buckets directory: {}", e))?
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_dir())
        .collect::<Vec<_>>();

    let mut buckets = Vec::new();

    for entry in bucket_dirs {
        let path = entry.path();
        match load_bucket_info(&path) {
            Ok(bucket) => buckets.push(bucket),
            Err(e) => {
                log::warn!("Skipping bucket at '{}': {}", path.display(), e);
            }
        }
    }

    log::info!("Found {} buckets", buckets.len());
    Ok(buckets)
}

/// Gets detailed information about a specific bucket.
#[tauri::command]
pub async fn get_bucket_info<R: Runtime>(
    _app: AppHandle<R>,
    state: State<'_, AppState>,
    bucket_name: String,
) -> Result<BucketInfo, String> {
    log::info!("Getting info for bucket: {}", bucket_name);

    let bucket_path = state.scoop_path.join("buckets").join(&bucket_name);

    if !bucket_path.exists() {
        return Err(format!("Bucket '{}' does not exist", bucket_name));
    }

    load_bucket_info(&bucket_path)
}

/// Lists all manifest files in a specific bucket.
#[tauri::command]
pub async fn get_bucket_manifests<R: Runtime>(
    _app: AppHandle<R>,
    state: State<'_, AppState>,
    bucket_name: String,
) -> Result<Vec<String>, String> {
    log::info!("Getting manifests for bucket: {}", bucket_name);

    let bucket_path = state.scoop_path.join("buckets").join(&bucket_name);

    if !bucket_path.exists() {
        return Err(format!("Bucket '{}' does not exist", bucket_name));
    }

    let mut manifests = Vec::new();

    // Check for manifests in the root of the bucket
    if let Ok(entries) = fs::read_dir(&bucket_path) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("json") {
                if let Some(file_stem) = path.file_stem().and_then(|s| s.to_str()) {
                    // Skip certain files that aren't package manifests
                    if !file_stem.starts_with('.') && file_stem != "bucket" {
                        manifests.push(format!("{} (root)", file_stem));
                    }
                }
            }
        }
    }

    // Always check the bucket/ subdirectory as well (many buckets primarily use this structure)
    let bucket_subdir = bucket_path.join("bucket");
    if bucket_subdir.is_dir() {
        if let Ok(entries) = fs::read_dir(bucket_subdir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("json") {
                    if let Some(file_stem) = path.file_stem().and_then(|s| s.to_str()) {
                        manifests.push(file_stem.to_string());
                    }
                }
            }
        }
    }

    manifests.sort();
    log::info!(
        "Found {} manifests in bucket '{}'",
        manifests.len(),
        bucket_name
    );
    Ok(manifests)
}

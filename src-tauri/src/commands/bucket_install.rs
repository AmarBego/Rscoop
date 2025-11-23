use git2::{Cred, CredentialType, FetchOptions, RemoteCallbacks, Repository};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::command;

use crate::commands::search::invalidate_manifest_cache;
use crate::utils;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BucketInstallOptions {
    pub name: String,
    pub url: String,
    pub force: bool, // Force reinstall if bucket already exists
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BucketInstallResult {
    pub success: bool,
    pub message: String,
    pub bucket_name: String,
    pub bucket_path: Option<String>,
    pub manifest_count: Option<u32>,
}

// Get the buckets directory path
fn get_buckets_dir() -> Result<PathBuf, String> {
    // Use fallback method to get scoop directory
    let scoop_dir = utils::get_scoop_root_fallback();
    Ok(scoop_dir.join("buckets"))
}


// Check if bucket already exists
fn bucket_exists(bucket_name: &str) -> Result<bool, String> {
    let buckets_dir = get_buckets_dir()?;
    let bucket_path = buckets_dir.join(bucket_name);
    Ok(bucket_path.exists())
}

// Get bucket directory path
fn get_bucket_path(bucket_name: &str) -> Result<PathBuf, String> {
    let buckets_dir = get_buckets_dir()?;
    Ok(buckets_dir.join(bucket_name))
}


// Clone repository with progress callback
fn clone_repository(url: &str, target_path: &Path) -> Result<Repository, String> {
    log::info!("Cloning repository {} to {:?}", url, target_path);

    // Create parent directory if it doesn't exist
    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent directory: {}", e))?;
    }

    // Set up remote callbacks for authentication and progress
    let mut remote_callbacks = RemoteCallbacks::new();

    // Handle authentication (for private repos)
    remote_callbacks.credentials(|_url, username_from_url, allowed_types| {
        if allowed_types.contains(CredentialType::USERNAME) {
            Cred::username("git")
        } else if allowed_types.contains(CredentialType::SSH_KEY) {
            let username = username_from_url.unwrap_or("git");
            Cred::ssh_key_from_agent(username)
        } else if allowed_types.contains(CredentialType::USER_PASS_PLAINTEXT) {
            // For HTTPS, use default credentials
            Cred::default()
        } else {
            Cred::default()
        }
    });

    // Progress callback for logging
    remote_callbacks.pack_progress(|_stage, current, total| {
        if total > 0 {
            let percentage = (current * 100) / total;
            log::debug!("Clone progress: {}% ({}/{})", percentage, current, total);
        }
    });

    // Set up fetch options
    let mut fetch_options = FetchOptions::new();
    fetch_options.remote_callbacks(remote_callbacks);

    // Clone the repository
    let mut builder = git2::build::RepoBuilder::new();
    builder.fetch_options(fetch_options);

    let repo = builder
        .clone(url, target_path)
        .map_err(|e| format!("Failed to clone repository: {}", e))?;

    log::info!("Successfully cloned repository to {:?}", target_path);
    Ok(repo)
}

// Remove bucket directory (cleanup on failure)
fn remove_bucket_directory(bucket_path: &Path) -> Result<(), String> {
    if bucket_path.exists() {
        fs::remove_dir_all(bucket_path)
            .map_err(|e| format!("Failed to remove bucket directory: {}", e))?;
    }
    Ok(())
}

// Main function to install a bucket
async fn install_bucket_internal(
    options: BucketInstallOptions,
) -> Result<BucketInstallResult, String> {
    let BucketInstallOptions { name, url, force } = options;

    // Validate and normalize URL
    let normalized_url = utils::validate_and_normalize_url(&url)?;

    // Extract or validate bucket name
    let bucket_name = if name.is_empty() {
        utils::extract_bucket_name_from_url(&normalized_url, None)?
    } else {
        utils::extract_bucket_name_from_url(&normalized_url, Some(&name))?
    };

    // Check if bucket already exists
    if bucket_exists(&bucket_name)? && !force {
        return Ok(BucketInstallResult {
            success: false,
            message: format!(
                "Bucket '{}' already exists. Use force=true to reinstall.",
                bucket_name
            ),
            bucket_name: bucket_name.clone(),
            bucket_path: Some(get_bucket_path(&bucket_name)?.to_string_lossy().to_string()),
            manifest_count: None,
        });
    }

    let bucket_path = get_bucket_path(&bucket_name)?;

    // If force is true and bucket exists, remove it first
    if force && bucket_path.exists() {
        log::info!(
            "Force reinstall: removing existing bucket '{}'",
            bucket_name
        );
        remove_bucket_directory(&bucket_path)?;
    }

    // Clone the repository
    let normalized_url_clone = normalized_url.clone();
    let bucket_path_clone = bucket_path.clone();

    let repo_result = tokio::task::spawn_blocking(move || {
        clone_repository(&normalized_url_clone, &bucket_path_clone)
    })
    .await
    .map_err(|e| e.to_string())?;

    match repo_result {
        Ok(_repo) => {
            // Count manifests
            let manifest_count = utils::count_manifests(&bucket_path);

            // Invalidate search cache so new bucket's packages are searchable
            invalidate_manifest_cache().await;

            log::info!(
                "Successfully installed bucket '{}' with {} manifests",
                bucket_name,
                manifest_count
            );

            Ok(BucketInstallResult {
                success: true,
                message: format!(
                    "Successfully installed bucket '{}' with {} manifests",
                    bucket_name, manifest_count
                ),
                bucket_name: bucket_name.clone(),
                bucket_path: Some(bucket_path.to_string_lossy().to_string()),
                manifest_count: Some(manifest_count),
            })
        }
        Err(e) => {
            // Clean up on failure
            let _ = remove_bucket_directory(&bucket_path);

            Err(format!("Failed to install bucket '{}': {}", bucket_name, e))
        }
    }
}

// Tauri command to install a bucket
#[command]
pub async fn install_bucket(options: BucketInstallOptions) -> Result<BucketInstallResult, String> {
    log::info!("Installing bucket: {} from {}", options.name, options.url);

    match install_bucket_internal(options).await {
        Ok(result) => {
            log::info!("Bucket installation result: {:?}", result);
            Ok(result)
        }
        Err(e) => {
            log::error!("Bucket installation failed: {}", e);
            Ok(BucketInstallResult {
                success: false,
                message: e,
                bucket_name: String::new(),
                bucket_path: None,
                manifest_count: None,
            })
        }
    }
}

// Command to check if a bucket can be installed (validation only)
#[command]
pub async fn validate_bucket_install(
    name: String,
    url: String,
) -> Result<BucketInstallResult, String> {
    log::info!("Validating bucket installation: {} from {}", name, url);

    // Validate URL
    let normalized_url = match utils::validate_and_normalize_url(&url) {
        Ok(url) => url,
        Err(e) => {
            return Ok(BucketInstallResult {
                success: false,
                message: format!("Invalid URL: {}", e),
                bucket_name: name,
                bucket_path: None,
                manifest_count: None,
            })
        }
    };

    // Extract bucket name
    let bucket_name = match utils::extract_bucket_name_from_url(
        &normalized_url,
        if name.is_empty() { None } else { Some(&name) },
    ) {
        Ok(name) => name,
        Err(e) => {
            return Ok(BucketInstallResult {
                success: false,
                message: format!("Invalid bucket name: {}", e),
                bucket_name: name,
                bucket_path: None,
                manifest_count: None,
            })
        }
    };

    // Check if bucket already exists
    let already_exists = bucket_exists(&bucket_name).unwrap_or(false);

    let bucket_path = if already_exists {
        Some(
            get_bucket_path(&bucket_name)
                .unwrap()
                .to_string_lossy()
                .to_string(),
        )
    } else {
        None
    };

    Ok(BucketInstallResult {
        success: !already_exists,
        message: if already_exists {
            format!("Bucket '{}' already exists", bucket_name)
        } else {
            format!(
                "Bucket '{}' can be installed from {}",
                bucket_name, normalized_url
            )
        },
        bucket_name,
        bucket_path,
        manifest_count: None,
    })
}

// Command to update a bucket (git pull)
#[command]
pub async fn update_bucket(bucket_name: String) -> Result<BucketInstallResult, String> {
    log::info!("Updating bucket: {}", bucket_name);

    let bucket_path = get_bucket_path(&bucket_name)?;

    if !bucket_path.exists() {
        return Ok(BucketInstallResult {
            success: false,
            message: format!("Bucket '{}' does not exist", bucket_name),
            bucket_name,
            bucket_path: None,
            manifest_count: None,
        });
    }

    // Check if it's a git repository
    if !bucket_path.join(".git").exists() {
        return Ok(BucketInstallResult {
            success: false,
            message: format!(
                "Bucket '{}' is not a git repository and cannot be updated",
                bucket_name
            ),
            bucket_name,
            bucket_path: Some(bucket_path.to_string_lossy().to_string()),
            manifest_count: None,
        });
    }

    let bucket_name_clone = bucket_name.clone();
    let bucket_path_clone = bucket_path.clone();

    tokio::task::spawn_blocking(move || update_bucket_sync(&bucket_name_clone, &bucket_path_clone))
        .await
        .map_err(|e| e.to_string())?
}

fn update_bucket_sync(bucket_name: &str, bucket_path: &Path) -> Result<BucketInstallResult, String> {
    // Try to update the repository using git2
    match Repository::open(bucket_path) {
        Ok(repo) => {
            // Fetch from origin
            let mut remote = match repo.find_remote("origin") {
                Ok(remote) => remote,
                Err(_) => {
                    return Ok(BucketInstallResult {
                        success: false,
                        message: format!("Bucket '{}' has no origin remote", bucket_name),
                        bucket_name: bucket_name.to_string(),
                        bucket_path: Some(bucket_path.to_string_lossy().to_string()),
                        manifest_count: None,
                    });
                }
            };

            // Set up callbacks for fetch
            let mut callbacks = RemoteCallbacks::new();
            callbacks.credentials(|_url, username_from_url, allowed_types| {
                if allowed_types.contains(CredentialType::USERNAME) {
                    Cred::username("git")
                } else if allowed_types.contains(CredentialType::SSH_KEY) {
                    let username = username_from_url.unwrap_or("git");
                    Cred::ssh_key_from_agent(username)
                } else if allowed_types.contains(CredentialType::USER_PASS_PLAINTEXT) {
                    Cred::default()
                } else {
                    Cred::default()
                }
            });

            let mut fetch_options = FetchOptions::new();
            fetch_options.remote_callbacks(callbacks);

            // Fetch latest changes
            match remote.fetch(&[] as &[&str], Some(&mut fetch_options), None) {
                Ok(_) => {
                    // Get current branch
                    let head = match repo.head() {
                        Ok(head) => head,
                        Err(_) => {
                            return Ok(BucketInstallResult {
                                success: false,
                                message: format!(
                                    "Could not get current branch for bucket '{}'",
                                    bucket_name
                                ),
                                bucket_name: bucket_name.to_string(),
                                bucket_path: Some(bucket_path.to_string_lossy().to_string()),
                                manifest_count: None,
                            });
                        }
                    };

                    if let Some(branch_name) = head.shorthand() {
                        // Try to merge origin/branch into current branch
                        let remote_branch_name = format!("origin/{}", branch_name);
                        match repo.find_branch(&remote_branch_name, git2::BranchType::Remote) {
                            Ok(remote_branch) => {
                                let remote_commit = remote_branch.get().peel_to_commit().unwrap();
                                let local_commit = head.peel_to_commit().unwrap();

                                // Check if update is needed
                                if remote_commit.id() == local_commit.id() {
                                    let manifest_count = utils::count_manifests(bucket_path);
                                    return Ok(BucketInstallResult {
                                        success: true,
                                        message: format!(
                                            "Bucket '{}' is already up to date",
                                            bucket_name
                                        ),
                                        bucket_name: bucket_name.to_string(),
                                        bucket_path: Some(
                                            bucket_path.to_string_lossy().to_string(),
                                        ),
                                        manifest_count: Some(manifest_count),
                                    });
                                }

                                // Perform fast-forward merge
                                let mut checkout_builder = git2::build::CheckoutBuilder::new();
                                checkout_builder.force();

                                repo.reset(
                                    remote_commit.as_object(),
                                    git2::ResetType::Hard,
                                    Some(&mut checkout_builder),
                                )
                                .map_err(|e| {
                                    format!("Failed to update bucket '{}': {}", bucket_name, e)
                                })?;

                                let manifest_count = utils::count_manifests(bucket_path);

                                log::info!(
                                    "Successfully updated bucket '{}' with {} manifests",
                                    bucket_name,
                                    manifest_count
                                );

                                Ok(BucketInstallResult {
                                    success: true,
                                    message: format!(
                                        "Successfully updated bucket '{}' with {} manifests",
                                        bucket_name, manifest_count
                                    ),
                                    bucket_name: bucket_name.to_string(),
                                    bucket_path: Some(bucket_path.to_string_lossy().to_string()),
                                    manifest_count: Some(manifest_count),
                                })
                            }
                            Err(_) => Ok(BucketInstallResult {
                                success: false,
                                message: format!(
                                    "Could not find remote branch for bucket '{}'",
                                    bucket_name
                                ),
                                bucket_name: bucket_name.to_string(),
                                bucket_path: Some(bucket_path.to_string_lossy().to_string()),
                                manifest_count: None,
                            }),
                        }
                    } else {
                        Ok(BucketInstallResult {
                            success: false,
                            message: format!(
                                "Could not determine current branch for bucket '{}'",
                                bucket_name
                            ),
                            bucket_name: bucket_name.to_string(),
                            bucket_path: Some(bucket_path.to_string_lossy().to_string()),
                            manifest_count: None,
                        })
                    }
                }
                Err(e) => Ok(BucketInstallResult {
                    success: false,
                    message: format!(
                        "Failed to fetch updates for bucket '{}': {}",
                        bucket_name, e
                    ),
                    bucket_name: bucket_name.to_string(),
                    bucket_path: Some(bucket_path.to_string_lossy().to_string()),
                    manifest_count: None,
                }),
            }
        }
        Err(e) => Ok(BucketInstallResult {
            success: false,
            message: format!(
                "Failed to open bucket '{}' as git repository: {}",
                bucket_name, e
            ),
            bucket_name: bucket_name.to_string(),
            bucket_path: Some(bucket_path.to_string_lossy().to_string()),
            manifest_count: None,
        }),
    }
}

/// Command to update all buckets sequentially.
/// Returns a list of per-bucket results. Non-fatal errors are captured in each result.
#[command]
pub async fn update_all_buckets() -> Result<Vec<BucketInstallResult>, String> {
    log::info!("Updating all buckets (auto-update task)");
    let buckets_dir = match get_buckets_dir() {
        Ok(p) => p,
        Err(e) => return Err(format!("Failed to resolve buckets directory: {}", e)),
    };

    if !buckets_dir.is_dir() {
        log::warn!(
            "Buckets directory does not exist: {}",
            buckets_dir.display()
        );
        return Ok(vec![]);
    }

    let mut results = Vec::new();

    let entries = match fs::read_dir(&buckets_dir) {
        Ok(e) => e,
        Err(e) => return Err(format!("Failed to read buckets directory: {}", e)),
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            match update_bucket(name.to_string()).await {
                Ok(res) => results.push(res),
                Err(e) => results.push(BucketInstallResult {
                    success: false,
                    message: e,
                    bucket_name: name.to_string(),
                    bucket_path: Some(path.to_string_lossy().to_string()),
                    manifest_count: None,
                }),
            }
        }
    }

    log::info!("Completed updating {} buckets", results.len());
    Ok(results)
}

// Command to remove a bucket
#[command]
pub async fn remove_bucket(bucket_name: String) -> Result<BucketInstallResult, String> {
    log::info!("Removing bucket: {}", bucket_name);

    let bucket_path = get_bucket_path(&bucket_name)?;

    if !bucket_path.exists() {
        return Ok(BucketInstallResult {
            success: false,
            message: format!("Bucket '{}' does not exist", bucket_name),
            bucket_name,
            bucket_path: None,
            manifest_count: None,
        });
    }

    match remove_bucket_directory(&bucket_path) {
        Ok(_) => {
            // Invalidate search cache so removed bucket's packages are no longer searchable
            invalidate_manifest_cache().await;

            log::info!("Successfully removed bucket '{}'", bucket_name);
            Ok(BucketInstallResult {
                success: true,
                message: format!("Successfully removed bucket '{}'", bucket_name),
                bucket_name,
                bucket_path: None,
                manifest_count: None,
            })
        }
        Err(e) => {
            log::error!("Failed to remove bucket '{}': {}", bucket_name, e);
            Ok(BucketInstallResult {
                success: false,
                message: format!("Failed to remove bucket '{}': {}", bucket_name, e),
                bucket_name,
                bucket_path: Some(bucket_path.to_string_lossy().to_string()),
                manifest_count: None,
            })
        }
    }
}


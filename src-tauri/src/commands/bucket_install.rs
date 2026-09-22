use git2::{
    CheckoutNotificationType, Cred, CredentialType, FetchOptions, RemoteCallbacks, Repository,
};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex, OnceLock,
};
use std::time::{Duration, Instant};
use tauri::{command, AppHandle, Manager, Runtime};

use crate::commands::search::invalidate_manifest_cache;
use crate::operations::{self, OperationKind};
use crate::state::AppState;
use crate::utils;

static BUCKET_INSTALL_CANCEL: OnceLock<Mutex<Option<Arc<AtomicBool>>>> = OnceLock::new();
static LAST_SUCCESSFUL_BUCKET_REFRESH: OnceLock<Mutex<Option<Instant>>> = OnceLock::new();
const BUCKET_REFRESH_FRESH_FOR: Duration = Duration::from_secs(3 * 60 * 60);

fn last_successful_bucket_refresh() -> &'static Mutex<Option<Instant>> {
    LAST_SUCCESSFUL_BUCKET_REFRESH.get_or_init(|| Mutex::new(None))
}

pub(crate) fn buckets_recently_refreshed() -> bool {
    last_successful_bucket_refresh()
        .lock()
        .ok()
        .and_then(|last| *last)
        .is_some_and(|last| last.elapsed() < BUCKET_REFRESH_FRESH_FOR)
}

fn all_bucket_updates_succeeded(results: &[BucketInstallResult]) -> bool {
    results.iter().all(|result| result.success)
}

fn bucket_install_cancel_slot() -> &'static Mutex<Option<Arc<AtomicBool>>> {
    BUCKET_INSTALL_CANCEL.get_or_init(|| Mutex::new(None))
}

fn set_bucket_install_cancel_token(token: Option<Arc<AtomicBool>>) {
    *bucket_install_cancel_slot().lock().unwrap() = token;
}

pub fn cancel_bucket_install() -> bool {
    if let Some(token) = bucket_install_cancel_slot().lock().unwrap().as_ref() {
        token.store(true, Ordering::Relaxed);
        true
    } else {
        false
    }
}

/// Creates git remote callbacks with credential handling for SSH and HTTPS.
fn create_remote_callbacks() -> RemoteCallbacks<'static> {
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
    callbacks
}

fn create_remote_callbacks_with_progress(
    app: Option<AppHandle>,
    cancel_token: Option<Arc<AtomicBool>>,
) -> RemoteCallbacks<'static> {
    let mut callbacks = create_remote_callbacks();

    if let Some(app) = app {
        let sideband_cancel = cancel_token.clone();
        let app_for_sideband = app.clone();
        callbacks.sideband_progress(move |data| {
            if sideband_cancel
                .as_ref()
                .map(|token| token.load(Ordering::Relaxed))
                .unwrap_or(false)
            {
                return false;
            }
            if let Ok(text) = std::str::from_utf8(data) {
                for line in text
                    .split(['\r', '\n'])
                    .map(str::trim)
                    .filter(|line| !line.is_empty())
                {
                    operations::append_output(&app_for_sideband, line.to_string(), "stderr");
                }
            }
            true
        });

        let transfer_cancel = cancel_token.clone();
        let app_for_transfer = app.clone();
        let mut last_transfer_pct: i32 = -10;
        callbacks.transfer_progress(move |stats| {
            if transfer_cancel
                .as_ref()
                .map(|token| token.load(Ordering::Relaxed))
                .unwrap_or(false)
            {
                return false;
            }
            let total = stats.total_objects();
            if total > 0 {
                let received = stats.received_objects();
                let pct = ((received * 100) / total) as i32;
                operations::set_current_phase(
                    &app_for_transfer,
                    Some("Receiving objects".to_string()),
                );
                operations::set_progress_fraction(
                    &app_for_transfer,
                    Some((received as f32 / total as f32).clamp(0.0, 1.0)),
                );
                if (pct == 100 && last_transfer_pct != 100) || pct >= last_transfer_pct + 10 {
                    last_transfer_pct = pct;
                    operations::append_output(
                        &app_for_transfer,
                        format!("Receiving objects: {}% ({}/{})", pct, received, total),
                        "stdout",
                    );
                }
            }
            true
        });

        let app_for_pack = app;
        let mut last_pack_pct: i32 = -10;
        callbacks.pack_progress(move |_stage, current, total| {
            if total > 0 {
                let pct = ((current * 100) / total) as i32;
                operations::set_current_phase(&app_for_pack, Some("Indexing objects".to_string()));
                operations::set_progress_fraction(
                    &app_for_pack,
                    Some((current as f32 / total as f32).clamp(0.0, 1.0)),
                );
                if (pct == 100 && last_pack_pct != 100) || pct >= last_pack_pct + 10 {
                    last_pack_pct = pct;
                    operations::append_output(
                        &app_for_pack,
                        format!("Indexing objects: {}% ({}/{})", pct, current, total),
                        "stdout",
                    );
                }
            }
        });
    }

    callbacks
}

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
fn get_buckets_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let scoop_dir = app.state::<AppState>().scoop_path();
    Ok(scoop_dir.join("buckets"))
}

// Check if bucket already exists
fn bucket_exists<R: Runtime>(app: &AppHandle<R>, bucket_name: &str) -> Result<bool, String> {
    let buckets_dir = get_buckets_dir(app)?;
    let bucket_path = buckets_dir.join(bucket_name);
    Ok(bucket_path.exists())
}

// Get bucket directory path
fn get_bucket_path<R: Runtime>(app: &AppHandle<R>, bucket_name: &str) -> Result<PathBuf, String> {
    let buckets_dir = get_buckets_dir(app)?;
    Ok(buckets_dir.join(bucket_name))
}

// Clone repository with progress callback
fn clone_repository(
    url: &str,
    target_path: &Path,
    progress_app: Option<AppHandle>,
    cancel_token: Option<Arc<AtomicBool>>,
) -> Result<Repository, String> {
    log::info!("Cloning repository {} to {:?}", url, target_path);

    // Create parent directory if it doesn't exist
    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent directory: {}", e))?;
    }

    let checkout_app = progress_app.clone();
    let checkout_cancel = cancel_token.clone();
    let remote_callbacks = create_remote_callbacks_with_progress(progress_app, cancel_token);

    // Set up fetch options
    let mut fetch_options = FetchOptions::new();
    fetch_options.remote_callbacks(remote_callbacks);

    // Clone the repository
    let mut builder = git2::build::RepoBuilder::new();
    builder.fetch_options(fetch_options);
    if let Some(app) = checkout_app {
        let mut checkout_builder = git2::build::CheckoutBuilder::new();
        let mut last_checkout_pct: i32 = -10;
        let progress_cancel = checkout_cancel.clone();
        checkout_builder.progress(move |_path, completed, total| {
            if total > 0 {
                if progress_cancel
                    .as_ref()
                    .map(|token| token.load(Ordering::Relaxed))
                    .unwrap_or(false)
                {
                    operations::set_current_phase(&app, Some("Cancelling".to_string()));
                    operations::set_progress_fraction(&app, None);
                    return;
                }
                let pct = ((completed * 100) / total) as i32;
                operations::set_current_phase(&app, Some("Checking out files".to_string()));
                operations::set_progress_fraction(
                    &app,
                    Some((completed as f32 / total as f32).clamp(0.0, 1.0)),
                );
                if (pct == 100 && last_checkout_pct != 100) || pct >= last_checkout_pct + 10 {
                    last_checkout_pct = pct;
                    operations::append_output(
                        &app,
                        format!("Checking out files: {}% ({}/{})", pct, completed, total),
                        "stdout",
                    );
                }
            }
        });
        let notify_cancel = checkout_cancel;
        checkout_builder.notify_on(CheckoutNotificationType::all());
        checkout_builder.notify(move |_why, _path, _baseline, _target, _workdir| {
            !notify_cancel
                .as_ref()
                .map(|token| token.load(Ordering::Relaxed))
                .unwrap_or(false)
        });
        builder.with_checkout(checkout_builder);
    }

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
    app: &AppHandle,
    options: BucketInstallOptions,
    progress_app: Option<AppHandle>,
    cancel_token: Option<Arc<AtomicBool>>,
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
    if bucket_exists(app, &bucket_name)? && !force {
        return Ok(BucketInstallResult {
            success: false,
            message: format!(
                "Bucket '{}' already exists. Use force=true to reinstall.",
                bucket_name
            ),
            bucket_name: bucket_name.clone(),
            bucket_path: Some(
                get_bucket_path(app, &bucket_name)?
                    .to_string_lossy()
                    .to_string(),
            ),
            manifest_count: None,
        });
    }

    let bucket_path = get_bucket_path(app, &bucket_name)?;

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
    let cancel_token_clone = cancel_token.clone();

    let repo_result = tokio::task::spawn_blocking(move || {
        clone_repository(
            &normalized_url_clone,
            &bucket_path_clone,
            progress_app,
            cancel_token_clone,
        )
    })
    .await
    .map_err(|e| e.to_string())?;

    match repo_result {
        Ok(_repo) => {
            // Count manifests
            let manifest_count = utils::count_manifests(&bucket_path);

            // Invalidate search cache so new bucket's packages are searchable
            invalidate_manifest_cache(&app.state::<AppState>().scoop_path()).await;

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

            if cancel_token
                .as_ref()
                .map(|token| token.load(Ordering::Relaxed))
                .unwrap_or(false)
            {
                Err(format!("Bucket install '{}' cancelled", bucket_name))
            } else {
                Err(format!("Failed to install bucket '{}': {}", bucket_name, e))
            }
        }
    }
}

// Tauri command to install a bucket
#[command]
pub async fn install_bucket(
    app: AppHandle,
    options: BucketInstallOptions,
) -> Result<BucketInstallResult, String> {
    log::info!("Installing bucket: {} from {}", options.name, options.url);

    let op_started = operations::start_synthetic(
        &app,
        "Installing bucket".to_string(),
        OperationKind::Install,
        None,
    )
    .is_some();
    if op_started {
        operations::append_output(&app, "Starting bucket install...".to_string(), "stdout");
    }

    let cancel_token = op_started.then(|| Arc::new(AtomicBool::new(false)));
    set_bucket_install_cancel_token(cancel_token.clone());

    let result = match install_bucket_internal(
        &app,
        options,
        op_started.then(|| app.clone()),
        cancel_token.clone(),
    )
    .await
    {
        Ok(result) => {
            log::info!("Bucket installation result: {:?}", result);
            result
        }
        Err(e) => {
            log::error!("Bucket installation failed: {}", e);
            BucketInstallResult {
                success: false,
                message: e.clone(),
                bucket_name: String::new(),
                bucket_path: None,
                manifest_count: None,
            }
        }
    };
    set_bucket_install_cancel_token(None);

    if op_started {
        operations::set_current_phase(&app, None);
        operations::set_progress_fraction(&app, None);
        operations::finish_synthetic(&app, result.success, result.message.clone());
    }

    Ok(result)
}

// Command to check if a bucket can be installed (validation only)
#[command]
pub async fn validate_bucket_install<R: Runtime>(
    app: AppHandle<R>,
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
    let already_exists = bucket_exists(&app, &bucket_name).unwrap_or(false);

    let bucket_path = if already_exists {
        get_bucket_path(&app, &bucket_name)
            .ok()
            .map(|p| p.to_string_lossy().to_string())
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
pub async fn update_bucket(
    app: AppHandle,
    bucket_name: String,
) -> Result<BucketInstallResult, String> {
    log::info!("Updating bucket: {}", bucket_name);
    let bucket_path = get_bucket_path(&app, &bucket_name)?;

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

    let result = tokio::task::spawn_blocking(move || {
        update_bucket_sync(&bucket_name_clone, &bucket_path_clone)
    })
    .await
    .map_err(|e| e.to_string())?;
    crate::manifest_review::after_update(&app, Some(bucket_name)).await;
    result
}

fn is_transient_fetch_error(error: &git2::Error) -> bool {
    use git2::{ErrorClass, ErrorCode};

    if matches!(
        error.code(),
        ErrorCode::Auth | ErrorCode::Certificate | ErrorCode::NotFound | ErrorCode::User
    ) {
        return false;
    }

    matches!(error.code(), ErrorCode::Timeout | ErrorCode::Eof)
        || matches!(error.class(), ErrorClass::Net | ErrorClass::Http)
        // WinHTTP reports response/connection failures as OS errors. Do not
        // retry unrelated OS failures such as permissions or disk errors.
        || (error.class() == ErrorClass::Os
            && ["failed to receive response", "failed to send request", "failed to connect"]
                .iter()
                .any(|message| error.message().to_ascii_lowercase().contains(message)))
}

fn retry_bucket_fetch(
    bucket_name: &str,
    mut fetch: impl FnMut() -> Result<(), git2::Error>,
    mut wait: impl FnMut(Duration),
) -> Result<(), git2::Error> {
    for attempt in 1..=3 {
        match fetch() {
            Ok(()) => return Ok(()),
            Err(error) if attempt < 3 && is_transient_fetch_error(&error) => {
                let delay = Duration::from_secs(attempt);
                log::warn!(
                    "Bucket '{}' fetch attempt {} failed: {}; retrying in {}s",
                    bucket_name,
                    attempt,
                    error,
                    delay.as_secs()
                );
                wait(delay);
            }
            Err(error) => return Err(error),
        }
    }
    unreachable!("the final fetch attempt always returns")
}

fn update_bucket_sync(
    bucket_name: &str,
    bucket_path: &Path,
) -> Result<BucketInstallResult, String> {
    // Try to update the repository using git2
    match Repository::open(bucket_path) {
        Ok(repo) => {
            // Fetch from origin
            match repo.find_remote("origin") {
                Ok(_) => {}
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

            // Recreate the remote and callbacks on each attempt so a broken
            // transport is not reused. This runs on the blocking worker.
            let fetched = retry_bucket_fetch(
                bucket_name,
                || {
                    let mut remote = repo.find_remote("origin")?;
                    let mut fetch_options = FetchOptions::new();
                    fetch_options.remote_callbacks(create_remote_callbacks());
                    remote.fetch(&[] as &[&str], Some(&mut fetch_options), None)
                },
                std::thread::sleep,
            );
            match fetched {
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

                    if let Ok(branch_name) = head.shorthand() {
                        // Try to merge origin/branch into current branch
                        let remote_branch_name = format!("origin/{}", branch_name);
                        match repo.find_branch(&remote_branch_name, git2::BranchType::Remote) {
                            Ok(remote_branch) => {
                                let remote_commit =
                                    remote_branch.get().peel_to_commit().map_err(|e| {
                                        format!(
                                            "Failed to resolve remote commit for bucket '{}': {}",
                                            bucket_name, e
                                        )
                                    })?;
                                let local_commit = head.peel_to_commit().map_err(|e| {
                                    format!(
                                        "Failed to resolve local commit for bucket '{}': {}",
                                        bucket_name, e
                                    )
                                })?;

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

                                // Preserve local manifest edits just like Scoop's git pull.
                                fast_forward_bucket(&repo, &local_commit, &remote_commit).map_err(
                                    |e| format!("Failed to update bucket '{}': {}", bucket_name, e),
                                )?;

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

fn fast_forward_bucket(
    repo: &Repository,
    local: &git2::Commit<'_>,
    remote: &git2::Commit<'_>,
) -> Result<(), String> {
    let _manifest_guard = super::manifest::MANIFEST_WRITES
        .lock()
        .map_err(|e| e.to_string())?;
    if !repo
        .graph_descendant_of(remote.id(), local.id())
        .map_err(|e| e.to_string())?
    {
        return Err("Bucket history has local commits or diverged from upstream. Resolve it in Git before updating; local files were kept.".into());
    }
    let head = repo.head().map_err(|e| e.to_string())?;
    if !head.is_branch() {
        return Err("Bucket HEAD is detached. Check out its branch before updating.".into());
    }
    let reference = head.name().map_err(|e| e.to_string())?;
    // Hold HEAD as well as its branch to prevent a concurrent branch switch.
    let mut head_lock = repo.transaction().map_err(|e| e.to_string())?;
    head_lock.lock_ref("HEAD").map_err(|e| e.to_string())?;
    let mut transaction = repo.transaction().map_err(|e| e.to_string())?;
    transaction.lock_ref(reference).map_err(|e| e.to_string())?;
    let current_head = repo.head().map_err(|e| e.to_string())?;
    if current_head.name().map_err(|e| e.to_string())? != reference
        || current_head.target() != Some(local.id())
    {
        return Err("Bucket HEAD changed during the update. Retry; local files were kept.".into());
    }
    // Resolve signatures and prepare the ref update before any checkout writes.
    transaction
        .set_target(reference, remote.id(), None, "rScoop: fast-forward bucket")
        .map_err(|e| e.to_string())?;
    let snapshot = super::bucket_checkout::CheckoutSnapshot::prepare(repo, local, remote)?;
    let started = std::cell::Cell::new(false);
    let checkout_result = {
        let mut checkout = git2::build::CheckoutBuilder::new();
        checkout.safe().overwrite_ignored(false);
        checkout.progress(|_, _, _| started.set(true));
        repo.checkout_tree(remote.as_object(), Some(&mut checkout))
    };
    if let Err(error) = checkout_result {
        return Err(if started.get() {
            snapshot.rollback(repo, &format!("Bucket checkout failed: {error}"))
        } else {
            format!("Local changes prevent this bucket update: {error}. Review the edited manifest and keep or undo your changes, then retry. Local files were kept.")
        });
    }
    if let Err(error) = transaction.commit() {
        // Commit can fail after checkout (e.g. a locked/unwritable reflog).
        // Re-lock and inspect the actual ref before deciding which state to keep.
        let reason = format!("Cannot advance bucket branch: {error}");
        let mut recovery_lock = match repo.transaction() {
            Ok(lock) => lock,
            Err(lock_error) => {
                return Err(snapshot.retain(&format!(
                    "{reason}; cannot create recovery lock: {lock_error}"
                )))
            }
        };
        if let Err(lock_error) = recovery_lock.lock_ref(reference) {
            return Err(snapshot.retain(&format!(
                "{reason}; cannot lock branch for recovery: {lock_error}"
            )));
        }
        match repo.refname_to_id(reference) {
            Ok(id) if id == local.id() => return Err(snapshot.rollback(repo, &reason)),
            Ok(id) if id == remote.id() => {
                // A backend may publish the ref before reporting a later error.
                // In that case checkout and branch already agree; do not undo it.
                log::warn!("{reason}; branch and checkout already reached upstream");
            }
            _ => return Err(snapshot.retain(&format!("{reason}; branch changed unexpectedly"))),
        }
    }
    Ok(())
}

#[cfg(test)]
mod fetch_tests {
    use super::*;
    use git2::{Error, ErrorClass, ErrorCode};

    #[test]
    fn global_refresh_only_succeeds_when_every_bucket_succeeds() {
        let result = |success| BucketInstallResult {
            success,
            message: String::new(),
            bucket_name: String::new(),
            bucket_path: None,
            manifest_count: None,
        };

        assert!(all_bucket_updates_succeeded(&[result(true), result(true)]));
        assert!(!all_bucket_updates_succeeded(&[
            result(true),
            result(false)
        ]));
    }

    fn commit_files(repo: &Repository, changes: &[(&str, &str)]) -> git2::Oid {
        let mut index = repo.index().unwrap();
        for (name, contents) in changes {
            let path = repo.workdir().unwrap().join(name);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, contents).unwrap();
            index.add_path(Path::new(name)).unwrap();
        }
        index.write().unwrap();
        let tree = repo.find_tree(index.write_tree().unwrap()).unwrap();
        let signature = git2::Signature::now("rScoop test", "test@example.invalid").unwrap();
        let parent = repo.head().ok().and_then(|head| head.peel_to_commit().ok());
        repo.commit(
            Some("HEAD"),
            &signature,
            &signature,
            "test update",
            &tree,
            &parent.iter().collect::<Vec<_>>(),
        )
        .unwrap()
    }

    fn local_bucket() -> (tempfile::TempDir, Repository, Repository) {
        let temp = tempfile::tempdir().unwrap();
        let mut options = git2::RepositoryInitOptions::new();
        options.initial_head("main");
        let upstream = Repository::init_opts(temp.path().join("upstream"), &options).unwrap();
        // Keep fixture bytes deterministic regardless of the user's autocrlf setting.
        commit_files(
            &upstream,
            &[
                (".gitattributes", "* -text\n"),
                ("bucket/edited.json", "original\n"),
                ("bucket/other.json", "other\n"),
            ],
        );
        let local = Repository::clone(
            upstream.workdir().unwrap().to_str().unwrap(),
            temp.path().join("local"),
        )
        .unwrap();
        (temp, upstream, local)
    }

    fn fetch_and_fast_forward(repo: &Repository) -> Result<(), String> {
        repo.find_remote("origin")
            .unwrap()
            .fetch(&[] as &[&str], None, None)
            .unwrap();
        let local = repo.head().unwrap().peel_to_commit().unwrap();
        let remote = repo
            .find_reference("refs/remotes/origin/main")
            .unwrap()
            .peel_to_commit()
            .unwrap();
        fast_forward_bucket(repo, &local, &remote)
    }

    #[test]
    fn bucket_update_preserves_edits_when_upstream_changes_another_manifest() {
        let (_temp, upstream, local) = local_bucket();
        let edited = local.workdir().unwrap().join("bucket/edited.json");
        std::fs::write(&edited, "my local fix\n").unwrap();
        let upstream_id = commit_files(&upstream, &[("bucket/other.json", "other update\n")]);
        fetch_and_fast_forward(&local).unwrap();
        assert_eq!(std::fs::read_to_string(edited).unwrap(), "my local fix\n");
        assert_eq!(local.head().unwrap().target(), Some(upstream_id));
        assert_eq!(
            std::fs::read_to_string(local.workdir().unwrap().join("bucket/other.json")).unwrap(),
            "other update\n"
        );
        assert!(local
            .status_file(Path::new("bucket/edited.json"))
            .unwrap()
            .is_wt_modified());
    }

    #[test]
    fn bucket_update_keeps_worktree_and_head_when_edited_manifest_conflicts() {
        let (_temp, upstream, local) = local_bucket();
        let edited = local.workdir().unwrap().join("bucket/edited.json");
        std::fs::write(&edited, "my local fix\n").unwrap();
        let before = local.head().unwrap().target();
        commit_files(
            &upstream,
            &[
                ("bucket/edited.json", "new upstream\n"),
                ("bucket/other.json", "other update\n"),
            ],
        );
        assert!(fetch_and_fast_forward(&local)
            .unwrap_err()
            .contains("Local changes"));
        let conflicts = crate::manifest_review::bucket_conflicts(local.workdir().unwrap(), "main");
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].package_name, "edited");
        assert_eq!(conflicts[0].bucket, "main");
        assert_eq!(std::fs::read_to_string(&edited).unwrap(), "my local fix\n");
        assert_eq!(
            std::fs::read_to_string(local.workdir().unwrap().join("bucket/other.json")).unwrap(),
            "other\n"
        );
        assert_eq!(local.head().unwrap().target(), before);
        // Accepting upstream in the manifest editor resolves this conflict.
        std::fs::write(&edited, "new upstream\n").unwrap();
        assert!(
            crate::manifest_review::bucket_conflicts(local.workdir().unwrap(), "main").is_empty()
        );
        fetch_and_fast_forward(&local).unwrap();
        assert_eq!(
            local.head().unwrap().target(),
            upstream.head().unwrap().target()
        );
    }

    #[test]
    fn bucket_update_rolls_back_files_and_index_when_branch_commit_fails() {
        let (_temp, upstream, local) = local_bucket();
        commit_files(
            &upstream,
            &[
                ("bucket/deleted.json", "to delete\n"),
                ("bucket/accepted.json", "original\n"),
                ("bucket/staged.json", "original\n"),
            ],
        );
        fetch_and_fast_forward(&local).unwrap();
        let root = local.workdir().unwrap();
        fs::write(root.join("bucket/edited.json"), "my local fix\n").unwrap();
        fs::write(root.join("bucket/accepted.json"), "accepted upstream\n").unwrap();
        fs::write(root.join("bucket/staged.json"), "staged fix\n").unwrap();
        let mut index = local.index().unwrap();
        index.add_path(Path::new("bucket/staged.json")).unwrap();
        index.write().unwrap();
        fs::write(root.join("bucket/staged.json"), "unstaged fix\n").unwrap();
        fs::write(root.join("bucket/.edited.json.rscoop-test.bak"), "backup\n").unwrap();
        let before_head = local.head().unwrap().target();
        let before_index = fs::read(local.path().join("index")).unwrap();

        fs::remove_file(upstream.workdir().unwrap().join("bucket/deleted.json")).unwrap();
        let mut remote_index = upstream.index().unwrap();
        remote_index
            .remove_path(Path::new("bucket/deleted.json"))
            .unwrap();
        remote_index.write().unwrap();
        commit_files(
            &upstream,
            &[
                ("bucket/other.json", "other update\n"),
                ("bucket/accepted.json", "accepted upstream\n"),
                ("bucket/new/added.json", "new file\n"),
            ],
        );

        // Ref locking still succeeds, but the reflog write at transaction
        // commit fails after checkout has already updated the worktree/index.
        let reflog = local.path().join("logs/refs/heads/main");
        let saved_log = reflog.with_extension("saved");
        local
            .config()
            .unwrap()
            .set_bool("core.logallrefupdates", true)
            .unwrap();
        fs::rename(&reflog, &saved_log).unwrap();
        fs::create_dir(&reflog).unwrap();
        fs::write(reflog.join("blocker"), "prevent reflog replacement").unwrap();
        let error = fetch_and_fast_forward(&local).unwrap_err();
        assert!(error.contains("Cannot advance bucket branch"), "{error}");
        assert!(error.contains("were restored"), "{error}");
        assert_eq!(local.head().unwrap().target(), before_head);
        assert_eq!(fs::read(local.path().join("index")).unwrap(), before_index);
        for (file, content) in [
            ("edited.json", "my local fix\n"),
            ("other.json", "other\n"),
            ("deleted.json", "to delete\n"),
            ("accepted.json", "accepted upstream\n"),
            ("staged.json", "unstaged fix\n"),
            (".edited.json.rscoop-test.bak", "backup\n"),
        ] {
            assert_eq!(
                fs::read_to_string(root.join("bucket").join(file)).unwrap(),
                content
            );
        }
        assert!(!root.join("bucket/new").exists());
        assert!(!local.path().join("HEAD.lock").exists());
        assert!(!local.path().join("refs/heads/main.lock").exists());
        fs::remove_file(reflog.join("blocker")).unwrap();
        fs::remove_dir(&reflog).unwrap();
        fs::rename(saved_log, reflog).unwrap();
        fetch_and_fast_forward(&local).unwrap();
        assert_eq!(
            local.head().unwrap().target(),
            upstream.head().unwrap().target()
        );
        assert_eq!(
            fs::read_to_string(root.join("bucket/edited.json")).unwrap(),
            "my local fix\n"
        );
    }

    #[test]
    fn bucket_update_rolls_back_when_checkout_cannot_write_index() {
        let (_temp, upstream, local) = local_bucket();
        let before_head = local.head().unwrap().target();
        let before_index = fs::read(local.path().join("index")).unwrap();
        commit_files(&upstream, &[("bucket/other.json", "upstream update\n")]);
        let index_lock = local.path().join("index.lock");
        fs::write(&index_lock, "another Git operation").unwrap();
        let error = fetch_and_fast_forward(&local).unwrap_err();
        assert!(error.contains("Bucket checkout failed"), "{error}");
        assert!(error.contains("were restored"), "{error}");
        assert_eq!(local.head().unwrap().target(), before_head);
        assert_eq!(fs::read(local.path().join("index")).unwrap(), before_index);
        assert_eq!(
            fs::read_to_string(local.workdir().unwrap().join("bucket/other.json")).unwrap(),
            "other\n"
        );
        assert_eq!(
            fs::read_to_string(&index_lock).unwrap(),
            "another Git operation"
        );
        fs::remove_file(index_lock).unwrap();
        fetch_and_fast_forward(&local).unwrap();
    }

    #[test]
    fn bucket_update_rollback_handles_file_directory_transitions() {
        let (_temp, upstream, local) = local_bucket();
        commit_files(
            &upstream,
            &[
                ("bucket/becomes-directory", "original file\n"),
                ("bucket/becomes-file/child.json", "original child\n"),
            ],
        );
        fetch_and_fast_forward(&local).unwrap();
        let before_index = fs::read(local.path().join("index")).unwrap();
        let before_head = local.head().unwrap().target();
        let remote_root = upstream.workdir().unwrap();
        fs::remove_file(remote_root.join("bucket/becomes-directory")).unwrap();
        fs::remove_file(remote_root.join("bucket/becomes-file/child.json")).unwrap();
        fs::remove_dir(remote_root.join("bucket/becomes-file")).unwrap();
        let mut index = upstream.index().unwrap();
        index
            .remove_path(Path::new("bucket/becomes-directory"))
            .unwrap();
        index
            .remove_path(Path::new("bucket/becomes-file/child.json"))
            .unwrap();
        index.write().unwrap();
        commit_files(
            &upstream,
            &[
                ("bucket/becomes-directory/child.json", "new child\n"),
                ("bucket/becomes-file", "new file\n"),
            ],
        );
        let index_lock = local.path().join("index.lock");
        fs::write(&index_lock, "block index write").unwrap();
        let error = fetch_and_fast_forward(&local).unwrap_err();
        assert!(error.contains("were restored"), "{error}");
        let root = local.workdir().unwrap();
        assert_eq!(
            fs::read_to_string(root.join("bucket/becomes-directory")).unwrap(),
            "original file\n"
        );
        assert_eq!(
            fs::read_to_string(root.join("bucket/becomes-file/child.json")).unwrap(),
            "original child\n"
        );
        assert_eq!(fs::read(local.path().join("index")).unwrap(), before_index);
        assert_eq!(local.head().unwrap().target(), before_head);
        fs::remove_file(index_lock).unwrap();
        fetch_and_fast_forward(&local).unwrap();
    }

    #[test]
    fn bucket_update_keeps_recovery_files_if_rollback_is_blocked() {
        let (_temp, upstream, local) = local_bucket();
        commit_files(
            &upstream,
            &[
                ("bucket/other.json", "updated\n"),
                ("bucket/new/added.json", "new file\n"),
            ],
        );
        local
            .find_remote("origin")
            .unwrap()
            .fetch(&[] as &[&str], None, None)
            .unwrap();
        let before = local.head().unwrap().peel_to_commit().unwrap();
        let remote = local
            .find_reference("refs/remotes/origin/main")
            .unwrap()
            .peel_to_commit()
            .unwrap();
        let snapshot =
            super::super::bucket_checkout::CheckoutSnapshot::prepare(&local, &before, &remote)
                .unwrap();
        local.checkout_tree(remote.as_object(), None).unwrap();
        let external = local.workdir().unwrap().join("bucket/new/external.txt");
        fs::write(&external, "keep this external file").unwrap();
        let error = snapshot.rollback(&local, "injected ref failure");
        assert!(error.contains("Bucket recovery is required"), "{error}");
        assert_eq!(
            fs::read_to_string(&external).unwrap(),
            "keep this external file"
        );
        let recovery = fs::read_dir(local.path())
            .unwrap()
            .filter_map(Result::ok)
            .find(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with("rscoop-checkout-")
            })
            .unwrap()
            .path();
        assert_eq!(
            fs::read_to_string(recovery.join("worktree/bucket/other.json")).unwrap(),
            "other\n"
        );
        assert!(recovery.join("index").is_file());
        assert!(recovery.join("paths.json").is_file());
    }

    #[test]
    fn bucket_update_does_not_discard_local_commits() {
        let (_temp, upstream, local) = local_bucket();
        let before = commit_files(&local, &[("bucket/edited.json", "committed fix\n")]);
        commit_files(&upstream, &[("bucket/other.json", "upstream change\n")]);
        assert!(fetch_and_fast_forward(&local)
            .unwrap_err()
            .contains("diverged"));
        assert_eq!(local.head().unwrap().target(), Some(before));
    }

    #[test]
    fn scoop_style_git_pull_preserves_local_fix_and_refuses_overlap() {
        let (_temp, upstream, local) = local_bucket();
        let edited = local.workdir().unwrap().join("bucket/edited.json");
        std::fs::write(&edited, "my local fix\n").unwrap();
        commit_files(&upstream, &[("bucket/other.json", "unrelated update\n")]);
        let pull = || {
            std::process::Command::new("git")
                .arg("-C")
                .arg(local.workdir().unwrap())
                .args(["-c", "pull.rebase=false", "pull", "--ff-only"])
                .output()
                .unwrap()
        };
        let first = pull();
        assert!(
            first.status.success(),
            "{}",
            String::from_utf8_lossy(&first.stderr)
        );
        assert_eq!(std::fs::read_to_string(&edited).unwrap(), "my local fix\n");
        commit_files(
            &upstream,
            &[("bucket/edited.json", "upstream replacement\n")],
        );
        assert!(!pull().status.success());
        assert_eq!(std::fs::read_to_string(edited).unwrap(), "my local fix\n");
    }

    fn response_error() -> Error {
        Error::new(
            ErrorCode::GenericError,
            ErrorClass::Os,
            "failed to receive response: The server returned an invalid or unrecognized response",
        )
    }

    #[test]
    fn retries_invalid_response_then_succeeds() {
        let mut attempts = 0;
        let mut delays = Vec::new();
        let result = retry_bucket_fetch(
            "versions",
            || {
                attempts += 1;
                if attempts < 3 {
                    Err(response_error())
                } else {
                    Ok(())
                }
            },
            |delay| delays.push(delay.as_secs()),
        );
        assert!(result.is_ok());
        assert_eq!(attempts, 3);
        assert_eq!(delays, vec![1, 2]);
    }

    #[test]
    fn persistent_transport_failure_stops_after_three_attempts() {
        let mut attempts = 0;
        let result = retry_bucket_fetch(
            "versions",
            || {
                attempts += 1;
                Err(response_error())
            },
            |_| {},
        );
        assert_eq!(attempts, 3);
        assert!(result
            .unwrap_err()
            .message()
            .contains("invalid or unrecognized response"));
    }

    #[test]
    fn permanent_errors_are_not_retried() {
        for (code, class) in [
            (ErrorCode::Auth, ErrorClass::Http),
            (ErrorCode::Certificate, ErrorClass::Ssl),
            (ErrorCode::NotFound, ErrorClass::Http),
            (ErrorCode::GenericError, ErrorClass::Os),
        ] {
            let mut attempts = 0;
            let result = retry_bucket_fetch(
                "versions",
                || {
                    attempts += 1;
                    Err(Error::new(code, class, "permission or configuration error"))
                },
                |_| panic!("permanent errors should not wait"),
            );
            assert!(result.is_err());
            assert_eq!(attempts, 1);
        }
    }
}

/// Command to update all buckets sequentially.
/// Returns a list of per-bucket results. Non-fatal errors are captured in each result.
#[command]
pub async fn update_all_buckets(app: AppHandle) -> Result<Vec<BucketInstallResult>, String> {
    log::info!("Updating all buckets (auto-update task)");
    let buckets_dir = match get_buckets_dir(&app) {
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
            match update_bucket(app.clone(), name.to_string()).await {
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

    if all_bucket_updates_succeeded(&results) {
        // Scoop uses this timestamp to decide whether install/update commands
        // should run its own `git pull`. Only claim a completed refresh when
        // every bucket succeeded.
        crate::commands::settings::mark_scoop_updated_now()?;
        *last_successful_bucket_refresh()
            .lock()
            .map_err(|error| error.to_string())? = Some(Instant::now());
    }

    log::info!("Completed updating {} buckets", results.len());
    Ok(results)
}

// Command to remove a bucket
#[command]
pub async fn remove_bucket<R: Runtime>(
    app: AppHandle<R>,
    bucket_name: String,
) -> Result<BucketInstallResult, String> {
    log::info!("Removing bucket: {}", bucket_name);

    let bucket_path = get_bucket_path(&app, &bucket_name)?;

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
            invalidate_manifest_cache(&app.state::<AppState>().scoop_path()).await;

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

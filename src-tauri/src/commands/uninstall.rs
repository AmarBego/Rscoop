//! Commands for uninstalling packages and clearing the cache.
use crate::commands::auto_cleanup::trigger_auto_cleanup;
use crate::commands::installed::invalidate_installed_cache;
use crate::commands::scoop::{self, ScoopOp};
use crate::commands::search::invalidate_manifest_cache;
use crate::state::AppState;
use tauri::{AppHandle, State, Window};

/// Uninstalls a Scoop package.
///
/// Note: The `bucket` parameter is not used by the underlying `scoop uninstall` command
/// but is included for API consistency and logging purposes.
///
/// # Arguments
/// * `window` - The Tauri window to emit events to.
/// * `package_name` - The name of the package to uninstall.
/// * `bucket` - The bucket the package belongs to (for logging purposes).
#[tauri::command]
pub async fn uninstall_package(
    window: Window,
    app: AppHandle,
    state: State<'_, AppState>,
    package_name: String,
    bucket: String,
) -> Result<(), String> {
    execute_package_operation(
        window.clone(),
        ScoopOp::Uninstall,
        "Uninstalling",
        &package_name,
        &bucket,
    )
    .await?;
    invalidate_manifest_cache().await;
    invalidate_installed_cache(state.clone()).await;

    // Trigger auto cleanup after uninstall
    trigger_auto_cleanup(app, state).await;

    Ok(())
}

/// Clears the cache for a Scoop package.
///
/// Note: The `bucket` parameter is not used by the underlying `scoop cache rm` command
/// but is included for API consistency and logging purposes.
///
/// # Arguments
/// * `window` - The Tauri window to emit events to.
/// * `package_name` - The name of the package to clear the cache for.
/// * `bucket` - The bucket the package belongs to (for logging purposes).
#[tauri::command]
pub async fn clear_package_cache(
    window: Window,
    app: AppHandle,
    state: State<'_, AppState>,
    package_name: String,
    bucket: String,
) -> Result<(), String> {
    execute_package_operation(
        window,
        ScoopOp::ClearCache,
        "Clearing cache for",
        &package_name,
        &bucket,
    )
    .await?;

    // Trigger auto cleanup after clearing cache
    trigger_auto_cleanup(app, state).await;

    Ok(())
}

/// A helper function to execute a Scoop operation on a package.
///
/// This function handles the common logic for parsing the bucket, logging the operation,
/// and calling the underlying `execute_scoop` function.
async fn execute_package_operation(
    window: Window,
    op: ScoopOp,
    op_name: &str,
    package_name: &str,
    bucket: &str,
) -> Result<(), String> {
    // The bucket is not used by `scoop uninstall` or `scoop cache rm`, but we parse it
    // for logging consistency and to align with the `install` command's signature.
    let bucket_opt = (!bucket.is_empty() && !bucket.eq_ignore_ascii_case("none")).then(|| bucket);

    log::info!(
        "{} package '{}' from bucket '{}'",
        op_name,
        package_name,
        bucket_opt.unwrap_or("default")
    );

    // Pass the bucket option along; `execute_scoop` will handle whether it's used.
    scoop::execute_scoop(window, op, Some(package_name), bucket_opt).await
}

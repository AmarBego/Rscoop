//! Command for installing Scoop packages.
use crate::commands::installed::invalidate_installed_cache;
use crate::commands::scoop::{self, ScoopOp};
use crate::commands::search::invalidate_manifest_cache;
use crate::state::AppState;
use tauri::{State, Window};

/// Installs a Scoop package, optionally from a specific bucket.
///
/// # Arguments
/// * `window` - The Tauri window to emit events to.
/// * `package_name` - The name of the package to install.
/// * `bucket` - The name of the bucket to install from. If empty or "None", the default buckets are used.
#[tauri::command]
pub async fn install_package(
    window: Window,
    state: State<'_, AppState>,
    package_name: String,
    bucket: String,
) -> Result<(), String> {
    let bucket_opt = if bucket.is_empty() || bucket.eq_ignore_ascii_case("none") {
        None
    } else {
        Some(bucket.as_str())
    };

    log::info!(
        "Installing package '{}' from bucket '{}'",
        package_name,
        bucket_opt.unwrap_or("default")
    );

    scoop::execute_scoop(window, ScoopOp::Install, Some(&package_name), bucket_opt).await?;
    invalidate_manifest_cache().await;
    invalidate_installed_cache(state).await;
    Ok(())
}

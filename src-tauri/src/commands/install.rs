//! Command for installing Scoop packages.
use crate::commands::auto_cleanup::trigger_auto_cleanup;
use crate::commands::installed::invalidate_installed_cache;
use crate::commands::scoop::{self, ScoopOp};
use crate::commands::search::invalidate_manifest_cache;
use crate::state::AppState;
use tauri::{AppHandle, State, Window};

/// Installs a Scoop package, optionally from a specific bucket and/or at a specific version.
///
/// # Arguments
/// * `window` - The Tauri window to emit events to.
/// * `package_name` - The name of the package to install.
/// * `bucket` - The name of the bucket to install from. If empty or "None", the default buckets are used.
/// * `version` - Optional version to install (e.g. "2.7.0"). Uses scoop's `pkg@version` syntax.
#[tauri::command]
pub async fn install_package(
    window: Window,
    app: AppHandle,
    state: State<'_, AppState>,
    package_name: String,
    bucket: String,
    version: Option<String>,
) -> Result<(), String> {
    // When installing a specific version, scoop's @version syntax doesn't support
    // the bucket/ prefix — so we drop the bucket in that case.
    let has_version = matches!(&version, Some(v) if !v.is_empty());

    let bucket_opt = if has_version {
        None
    } else {
        crate::utils::is_valid_bucket(&bucket).then(|| bucket.as_str())
    };

    let install_target = match &version {
        Some(v) if !v.is_empty() => format!("{}@{}", package_name, v),
        _ => package_name.clone(),
    };

    log::info!(
        "Installing package '{}' from bucket '{}'",
        install_target,
        bucket_opt.unwrap_or("default")
    );

    scoop::execute_scoop(window, ScoopOp::Install, Some(&install_target), bucket_opt).await?;
    invalidate_manifest_cache().await;
    invalidate_installed_cache(state.clone()).await;

    // Trigger auto cleanup after install
    trigger_auto_cleanup(app, state).await;

    Ok(())
}

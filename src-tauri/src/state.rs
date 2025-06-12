use crate::models::ScoopPackage;
use std::path::PathBuf;
use tokio::sync::Mutex;

/// Shared application state managed by Tauri.
pub struct AppState {
    /// The resolved path to the Scoop installation directory.
    pub scoop_path: PathBuf,
    /// A cache for the list of installed packages.
    pub installed_packages: Mutex<Option<Vec<ScoopPackage>>>,
}

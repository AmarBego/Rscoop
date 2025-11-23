use crate::models::ScoopPackage;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::RwLock;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::Mutex;

#[derive(Clone)]
pub struct InstalledPackagesCache {
    pub packages: Vec<ScoopPackage>,
    pub fingerprint: String,
}

#[derive(Clone, Debug)]
pub struct PackageVersionsCache {
    pub fingerprint: String, // Same fingerprint as installed packages cache
    pub versions_map: HashMap<String, Vec<String>>, // package_name -> list of version dirs
}

/// Shared application state managed by Tauri.
pub struct AppState {
    /// The resolved path to the Scoop installation directory.
    scoop_path: RwLock<PathBuf>,
    /// A cache for the list of installed packages and their fingerprint.
    pub installed_packages: Mutex<Option<InstalledPackagesCache>>,
    /// A cache for package versions, invalidated when installed packages change
    pub package_versions: Mutex<Option<PackageVersionsCache>>,
    /// Timestamp (ms) of the last installed packages refresh to prevent rapid consecutive calls
    last_refresh_time: AtomicU64,
}

impl AppState {
    /// Creates new application state with the provided Scoop root path.
    pub fn new(initial_scoop_path: PathBuf) -> Self {
        Self {
            scoop_path: RwLock::new(initial_scoop_path),
            installed_packages: Mutex::new(None),
            package_versions: Mutex::new(None),
            last_refresh_time: AtomicU64::new(0),
        }
    }

    /// Returns the current Scoop root path stored in the application state.
    pub fn scoop_path(&self) -> PathBuf {
        self.scoop_path.read().unwrap().clone()
    }

    /// Updates the Scoop root path stored in the application state.
    pub fn set_scoop_path(&self, new_path: PathBuf) {
        *self.scoop_path.write().unwrap() = new_path;
    }

    /// Gets the timestamp of the last installed packages refresh in milliseconds
    pub fn last_refresh_time(&self) -> u64 {
        self.last_refresh_time.load(Ordering::Relaxed)
    }

    /// Updates the timestamp of the last installed packages refresh
    pub fn update_refresh_time(&self) {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        self.last_refresh_time.store(now, Ordering::Relaxed);
    }

    /// Checks if a refresh should be debounced (less than 1 second since last refresh)
    pub fn should_debounce_refresh(&self) -> bool {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let last_refresh = self.last_refresh_time();
        
        // If last_refresh is 0, it's the first run, so don't debounce
        if last_refresh == 0 {
            return false;
        }
        
        now.saturating_sub(last_refresh) < 1000 // Debounce within 1 second
    }
}

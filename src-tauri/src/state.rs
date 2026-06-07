use crate::models::ScoopPackage;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex as StdMutex, RwLock};
use std::time::{Duration, Instant};
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
    /// Last explicit installed-package refresh accepted by the backend.
    last_installed_refresh_at: StdMutex<Option<Instant>>,
}

impl AppState {
    /// Creates new application state with the provided Scoop root path.
    pub fn new(initial_scoop_path: PathBuf) -> Self {
        Self {
            scoop_path: RwLock::new(initial_scoop_path),
            installed_packages: Mutex::new(None),
            package_versions: Mutex::new(None),
            last_installed_refresh_at: StdMutex::new(None),
        }
    }

    /// Returns the current Scoop root path stored in the application state.
    pub fn scoop_path(&self) -> PathBuf {
        self.scoop_path
            .read()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }

    /// Updates the Scoop root path stored in the application state.
    ///
    /// Returns whether the path changed. When it does, path-dependent caches
    /// are cleared so later reads cannot use packages from the old Scoop root.
    pub async fn set_scoop_path(&self, new_path: PathBuf) -> bool {
        let changed = {
            let mut current_path = self.scoop_path.write().unwrap_or_else(|e| e.into_inner());
            if *current_path == new_path {
                false
            } else {
                *current_path = new_path;
                true
            }
        };

        if changed {
            *self.installed_packages.lock().await = None;
            *self.package_versions.lock().await = None;
        }

        changed
    }

    /// Claims an explicit refresh slot. Returns false when the caller is
    /// inside the debounce window and should use the normal cache-aware fetch.
    pub fn claim_installed_refresh(&self, debounce_window: Duration) -> bool {
        let now = Instant::now();
        let mut last_refresh = self
            .last_installed_refresh_at
            .lock()
            .unwrap_or_else(|e| e.into_inner());

        if last_refresh
            .map(|previous| now.duration_since(previous) < debounce_window)
            .unwrap_or(false)
        {
            return false;
        }

        *last_refresh = Some(now);
        true
    }
}

#[cfg(test)]
mod tests {
    use super::{AppState, InstalledPackagesCache, PackageVersionsCache};
    use crate::models::ScoopPackage;
    use std::collections::HashMap;
    use std::path::PathBuf;

    #[tokio::test]
    async fn set_scoop_path_clears_path_dependent_caches_on_change() {
        let state = AppState::new(PathBuf::from("C:\\scoop-old"));
        seed_caches(&state).await;

        let changed = state.set_scoop_path(PathBuf::from("D:\\scoop-new")).await;

        assert!(changed);
        assert_eq!(state.scoop_path(), PathBuf::from("D:\\scoop-new"));
        assert!(state.installed_packages.lock().await.is_none());
        assert!(state.package_versions.lock().await.is_none());
    }

    #[tokio::test]
    async fn set_scoop_path_keeps_caches_when_path_is_unchanged() {
        let state = AppState::new(PathBuf::from("C:\\scoop"));
        seed_caches(&state).await;

        let changed = state.set_scoop_path(PathBuf::from("C:\\scoop")).await;

        assert!(!changed);
        assert!(state.installed_packages.lock().await.is_some());
        assert!(state.package_versions.lock().await.is_some());
    }

    async fn seed_caches(state: &AppState) {
        *state.installed_packages.lock().await = Some(InstalledPackagesCache {
            packages: vec![ScoopPackage {
                name: "example".to_string(),
                ..Default::default()
            }],
            fingerprint: "fingerprint".to_string(),
        });

        *state.package_versions.lock().await = Some(PackageVersionsCache {
            fingerprint: "fingerprint".to_string(),
            versions_map: HashMap::from([("example".to_string(), vec!["1.0.0".to_string()])]),
        });
    }
}

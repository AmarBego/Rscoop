// Central data model definitions shared across commands and services.
// By placing them in a dedicated module we reduce cross-module coupling and
// make the types easier to test.

use serde::{Deserialize, Serialize};

// -----------------------------------------------------------------------------
// MatchSource
// -----------------------------------------------------------------------------
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MatchSource {
    Name,
    Binary,
    None,
}

impl Default for MatchSource {
    fn default() -> Self {
        MatchSource::None
    }
}

// -----------------------------------------------------------------------------
// ScoopPackage
// -----------------------------------------------------------------------------
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, Default)]
pub struct ScoopPackage {
    pub name: String,
    pub version: String,
    pub source: String,
    pub updated: String,
    pub is_installed: bool,
    pub info: String,
    #[serde(default)]
    pub match_source: MatchSource,
    #[serde(default)]
    pub is_versioned_install: bool,
}

// -----------------------------------------------------------------------------
// SearchResult
// -----------------------------------------------------------------------------
#[derive(Serialize, Deserialize, Debug, Default)]
pub struct SearchResult {
    pub packages: Vec<ScoopPackage>,
    pub is_cold: bool,
}

// -----------------------------------------------------------------------------
// BucketInfo
// -----------------------------------------------------------------------------
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct BucketInfo {
    pub name: String,
    pub path: String,
    pub manifest_count: u32,
    pub is_git_repo: bool,
    pub git_url: Option<String>,
    pub git_branch: Option<String>,
    pub last_updated: Option<String>,
}

// -----------------------------------------------------------------------------
// Status Types
// -----------------------------------------------------------------------------
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AppStatusInfo {
    pub name: String,
    pub installed_version: String,
    pub latest_version: Option<String>,
    pub missing_dependencies: Vec<String>,
    pub info: Vec<String>,
    pub is_outdated: bool,
    pub is_failed: bool,
    pub is_held: bool,
    pub is_deprecated: bool,
    pub is_removed: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ScoopStatus {
    pub scoop_needs_update: bool,
    pub bucket_needs_update: bool,
    pub network_failure: bool,
    pub apps_with_issues: Vec<AppStatusInfo>,
    pub is_everything_ok: bool,
}

// -----------------------------------------------------------------------------
// Manifest Types (from installed.rs)
// -----------------------------------------------------------------------------
#[derive(Deserialize, Debug, Clone)]
pub struct PackageManifest {
    pub description: Option<String>,
    pub version: String,
}

#[derive(Deserialize, Debug, Clone, Default)]
pub struct InstallManifest {
    pub bucket: Option<String>,
}

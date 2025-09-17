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

// This command is a reimplementation of the `sfsu search` command.
// I am grateful to the SFSU team for their original work and logic.
// Original source: https://github.com/winpax/sfsu/blob/trunk/src/commands/search.rs

use crate::commands::installed::{MatchSource, ScoopPackage};
use rayon::prelude::*;
use regex::Regex;
use sprinkles::{
    buckets::Bucket,
    contexts::{ScoopContext, User},
    packages::{Manifest, MergeDefaults, SearchMode},
    Architecture,
};

#[derive(Debug, Clone)]
#[must_use = "MatchCriteria has no side effects"]
/// The criteria for a match
pub struct MatchCriteria {
    name: bool,
    bins: Vec<String>,
}

impl MatchCriteria {
    /// Create a new match criteria
    pub const fn new() -> Self {
        Self {
            name: false,
            bins: vec![],
        }
    }

    /// Check if the name matches
    pub fn matches(
        file_name: &str,
        pattern: &Regex,
        list_binaries: impl FnOnce() -> Vec<String>,
        mode: SearchMode,
    ) -> Self {
        let mut output = MatchCriteria::new();

        if mode.match_names() {
            output.match_names(pattern, file_name);
        }

        if mode.match_binaries() {
            output.match_binaries(pattern, list_binaries());
        }

        output
    }

    fn match_names(&mut self, pattern: &Regex, file_name: &str) -> &mut Self {
        if pattern.is_match(file_name) {
            self.name = true;
        }
        self
    }

    fn match_binaries(&mut self, pattern: &Regex, binaries: Vec<String>) -> &mut Self {
        let binary_matches = binaries
            .into_iter()
            .filter(|binary| pattern.is_match(binary))
            .filter_map(|b| {
                if pattern.is_match(&b) {
                    Some(b.clone())
                } else {
                    None
                }
            });

        self.bins.extend(binary_matches);

        self
    }
}

impl Default for MatchCriteria {
    fn default() -> Self {
        Self::new()
    }
}

struct MatchedManifest {
    manifest: Manifest,
    installed: bool,
    name_matched: bool,
    bins: Vec<String>,
}

impl MatchedManifest {
    pub fn new(
        ctx: &impl ScoopContext,
        manifest: Manifest,
        pattern: &Regex,
        mode: SearchMode,
        arch: Architecture,
    ) -> MatchedManifest {
        // TODO: Better display of output
        let bucket = unsafe { manifest.bucket() };

        let match_output = MatchCriteria::matches(
            unsafe { manifest.name() },
            pattern,
            // Function to list binaries from a manifest
            // Passed as a closure to avoid this parsing if bin matching isn't required
            || {
                manifest
                    .architecture
                    .merge_default(manifest.install_config.clone(), arch)
                    .bin
                    .map(|b| b.to_vec())
                    .unwrap_or_default()
            },
            mode,
        );

        let installed = manifest.is_installed(ctx, Some(bucket));

        MatchedManifest {
            manifest,
            installed,
            name_matched: match_output.name,
            bins: match_output.bins,
        }
    }

    pub fn should_match(&self, installed_only: bool) -> bool {
        if !self.installed && installed_only {
            return false;
        }
        if !self.name_matched && self.bins.is_empty() {
            return false;
        }

        true
    }
}

#[tauri::command]
pub async fn search_scoop(term: String) -> Result<Vec<ScoopPackage>, String> {
    if term.is_empty() {
        return Ok(vec![]);
    }

    log::info!("Searching for term: '{}'", term);

    let ctx = User::new().map_err(|e| e.to_string())?;

    let pattern = Regex::new(&format!("(?i){term}")).map_err(|e| e.to_string())?;
    let arch = Architecture::ARCH;

    let buckets = Bucket::list_all(&ctx).map_err(|e| e.to_string())?;

    let packages: Vec<ScoopPackage> = buckets
        .par_iter()
        .filter_map(|bucket| bucket.matches(&ctx, false, &pattern, SearchMode::Both).ok())
        .flatten()
        .map(|manifest| MatchedManifest::new(&ctx, manifest, &pattern, SearchMode::Both, arch))
        .filter(|manifest| manifest.should_match(false))
        .map(|manifest| {
            let info = if manifest.bins.is_empty() {
                "".to_string()
            } else {
                format!("includes {}", manifest.bins.join(", "))
            };

            let match_source = if manifest.name_matched {
                MatchSource::Name
            } else {
                MatchSource::Binary
            };

            ScoopPackage {
                name: unsafe { manifest.manifest.name() }.to_string(),
                version: manifest.manifest.version.to_string(),
                source: unsafe { manifest.manifest.bucket() }.to_string(),
                is_installed: manifest.installed,
                updated: "".to_string(),
                info,
                match_source,
                ..Default::default()
            }
        })
        .collect();

    log::info!("Found {} packages matching '{}'", packages.len(), term);

    Ok(packages)
} 
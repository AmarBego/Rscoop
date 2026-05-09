//! Commands for exporting and importing an rScoop profile.
//!
//! A profile is a JSON document describing a user's rScoop + Scoop setup —
//! installed apps, bucket list, held packages, Scoop global config, and
//! rScoop's own preferences. Profiles are portable: save one on machine A,
//! load it on machine B.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use tauri::{AppHandle, Runtime, State};
use tauri_plugin_store::StoreExt;

use crate::commands::bucket::get_buckets;
use crate::commands::bucket_install::{install_bucket, BucketInstallOptions};
use crate::commands::hold::list_held_packages;
use crate::commands::installed::get_installed_packages_full;
use crate::operations::{self, EnqueueAction};
use crate::state::AppState;

const STORE_PATH: &str = "store.json";
const SCHEMA_VERSION: &str = "1.0";

/// Top-level profile document.
///
/// Forward-compatibility contract:
///   * Unknown fields at any level are silently ignored (serde default).
///   * All fields below are optional on the read path — a profile written by
///     a newer rScoop that dropped a field still parses, as does a minimal
///     `{}` document.
///   * Collections whose element fails to parse are *not* fatal — we keep the
///     valid items and skip the rest. See `inspect_profile` / `import_profile`
///     which parse `apps` / `buckets` as `Vec<Value>` and filter lenient.
#[derive(Debug, Default, Serialize, Deserialize)]
pub struct Profile {
    #[serde(default)]
    pub schema: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exported_at: Option<String>,
    #[serde(default)]
    pub groups: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub apps: Option<Vec<Value>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub buckets: Option<Vec<Value>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub holds: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scoop_config: Option<Map<String, Value>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rscoop_settings: Option<Map<String, Value>>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct ProfileApp {
    pub name: String,
    pub source: String,
    pub version: String,
    /// True if the source machine had this installed as a pinned/versioned
    /// install (scoop's `install pkg@version` path, detected via an empty
    /// `bucket` in its `install.json`). On import we pass `version` through
    /// only when this is set — otherwise we install the latest manifest so
    /// the app stays updatable.
    pub versioned: bool,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct ProfileBucket {
    pub name: String,
    pub source: String,
}

/// Parse a profile JSON string tolerantly. Rejects only if the document is
/// not valid JSON or not a JSON object at the top level. Missing fields,
/// unknown fields, and partially-corrupt collections are all accepted.
///
/// Also returns a list of non-fatal warnings so the caller can surface them
/// to the user without failing the operation.
fn parse_profile_lenient(json: &str) -> Result<(Profile, Vec<String>), String> {
    let mut warnings = Vec::new();

    let raw: Value = serde_json::from_str(json)
        .map_err(|e| format!("Not valid JSON: {}", e))?;
    if !raw.is_object() {
        return Err("Profile must be a JSON object.".to_string());
    }

    let profile: Profile = serde_json::from_value(raw)
        .map_err(|e| format!("Could not read profile shape: {}", e))?;

    // Major-version compatibility. Same major = assume readable; different
    // major = warn but still try.
    if !profile.schema.is_empty() {
        let our_major = SCHEMA_VERSION.split('.').next().unwrap_or("1");
        let their_major = profile.schema.split('.').next().unwrap_or("");
        if their_major != our_major && !their_major.is_empty() {
            warnings.push(format!(
                "Profile schema v{} differs from this version's v{} — reading best-effort.",
                profile.schema, SCHEMA_VERSION
            ));
        }
    }

    Ok((profile, warnings))
}

/// Best-effort parse of a heterogeneous list: keep items that deserialize,
/// count those that don't so we can report.
fn lenient_list<T: for<'de> Deserialize<'de>>(list: &[Value]) -> (Vec<T>, usize) {
    let mut ok = Vec::with_capacity(list.len());
    let mut skipped = 0usize;
    for v in list {
        match serde_json::from_value::<T>(v.clone()) {
            Ok(t) => ok.push(t),
            Err(_) => skipped += 1,
        }
    }
    (ok, skipped)
}

/// rScoop store keys that are considered user preferences and are safe to
/// round-trip. Anything not in this list is left untouched on import.
const RSCOOP_SETTING_KEYS: &[&str] = &[
    "window.closeToTray",
    "window.firstTrayNotificationShown",
    "cleanup.autoCleanupEnabled",
    "cleanup.cleanupOldVersions",
    "cleanup.cleanupCache",
    "cleanup.preserveVersionCount",
    "cleanup.autoClearCacheOnUninstall",
    "buckets.autoUpdateInterval",
    "buckets.autoUpdatePackagesEnabled",
    "operations.backgroundByDefault",
];

fn read_scoop_config_file() -> Result<Map<String, Value>, String> {
    let path = dirs::config_dir()
        .ok_or_else(|| "Could not determine config directory".to_string())?
        .join("scoop")
        .join("config.json");
    if !path.exists() {
        return Ok(Map::new());
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read scoop config: {}", e))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse scoop config: {}", e))
}

fn write_scoop_config_file(config: &Map<String, Value>) -> Result<(), String> {
    let path = dirs::config_dir()
        .ok_or_else(|| "Could not determine config directory".to_string())?
        .join("scoop")
        .join("config.json");
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

/// Export the selected groups of state to a JSON string.
///
/// `groups` mirrors the frontend's group IDs:
///   apps | buckets | holds | scoopConfig |
///   appearance | window | tray | automation | updates | virustotal | path
///
/// `include_secrets` gates the VirusTotal API key inside `scoopConfig` — when
/// false, the key is stripped before serialization.
#[tauri::command]
pub async fn export_profile<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    groups: Vec<String>,
    include_secrets: bool,
) -> Result<String, String> {
    log::info!("Exporting profile, groups={:?}, secrets={}", groups, include_secrets);

    let want = |id: &str| groups.iter().any(|g| g == id);

    let apps = if want("apps") {
        let pkgs = get_installed_packages_full(app.clone(), state.clone()).await?;
        let values = pkgs
            .into_iter()
            .map(|p| ProfileApp {
                name: p.name,
                source: p.source,
                version: p.version,
                versioned: p.is_versioned_install,
            })
            .map(|a| serde_json::to_value(a).unwrap_or(Value::Null))
            .collect::<Vec<_>>();
        Some(values)
    } else {
        None
    };

    let buckets = if want("buckets") {
        let bs = get_buckets(app.clone(), state.clone()).await?;
        let values = bs
            .into_iter()
            .map(|b| ProfileBucket {
                name: b.name,
                source: b.git_url.unwrap_or_default(),
            })
            .map(|b| serde_json::to_value(b).unwrap_or(Value::Null))
            .collect::<Vec<_>>();
        Some(values)
    } else {
        None
    };

    let holds = if want("holds") {
        Some(list_held_packages(app.clone(), state.clone()).await?)
    } else {
        None
    };

    let scoop_config = if want("scoopConfig") {
        let mut cfg = read_scoop_config_file()?;
        if !include_secrets {
            cfg.remove("virustotal_api_key");
        }
        Some(cfg)
    } else {
        None
    };

    // rScoop-managed settings — one flat map keyed by the rscoop-setting keys.
    let rscoop_settings = {
        let mut any = false;
        let mut map = Map::new();

        // The frontend settings group IDs map to prefixes in the store.
        let key_matches_group = |key: &str| -> bool {
            if key.starts_with("cleanup.") && want("automation") { return true; }
            if key.starts_with("buckets.") && want("updates") { return true; }
            if key.starts_with("window.") && want("window") { return true; }
            if key.starts_with("operations.") && want("automation") { return true; }
            false
        };

        let store = app
            .store(PathBuf::from(STORE_PATH))
            .map_err(|e| e.to_string())?;
        for key in RSCOOP_SETTING_KEYS {
            if !key_matches_group(key) { continue; }
            if let Some(v) = store.get(*key) {
                map.insert((*key).to_string(), v.clone());
                any = true;
            }
        }

        // scoop_path override under the "path" group.
        if want("path") {
            if let Some(v) = store.get("scoop_path") {
                map.insert("scoop_path".to_string(), v.clone());
                any = true;
            }
        }

        if any { Some(map) } else { None }
    };

    let profile = Profile {
        schema: SCHEMA_VERSION.to_string(),
        exported_at: Some(chrono::Utc::now().to_rfc3339()),
        groups,
        apps,
        buckets,
        holds,
        scoop_config,
        rscoop_settings,
    };

    serde_json::to_string_pretty(&profile).map_err(|e| e.to_string())
}

/// Write an already-serialized profile JSON string to the given path.
/// The frontend uses `plugin-dialog`'s `save()` to pick the path, then calls
/// this to actually write the bytes. Keeping this in Rust avoids pulling in
/// `plugin-fs` just for one write.
#[tauri::command]
pub fn save_profile_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| format!("Failed to write {}: {}", path, e))
}

/// Counterpart to `save_profile_file` — reads a profile JSON back into a
/// string so the Import modal can load a file the user picked without
/// requiring `plugin-fs`.
#[tauri::command]
pub fn read_profile_file_at(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
}

#[derive(Debug, Serialize)]
pub struct ProfileSummary {
    pub schema: String,
    pub exported_at: Option<String>,
    pub valid: bool,
    pub groups_present: Vec<String>,
    pub app_count: usize,
    pub bucket_count: usize,
    pub hold_count: usize,
    pub setting_count: usize,
    pub has_scoop_config: bool,
    pub has_secrets: bool,
    /// Non-fatal parse warnings (unknown schema major version, skipped rows).
    /// Empty when the profile reads cleanly.
    pub warnings: Vec<String>,
}

/// Parse a profile JSON string and return a summary without applying anything.
/// Used by the import modal to show the user what's inside the file.
#[tauri::command]
pub fn inspect_profile(json: String) -> Result<ProfileSummary, String> {
    let (profile, mut warnings) = parse_profile_lenient(&json)?;

    let mut groups_present = Vec::new();
    if profile.apps.is_some() { groups_present.push("apps".into()); }
    if profile.buckets.is_some() { groups_present.push("buckets".into()); }
    if profile.holds.is_some() { groups_present.push("holds".into()); }
    if profile.scoop_config.is_some() { groups_present.push("scoopConfig".into()); }
    if profile.rscoop_settings.is_some() { groups_present.push("rscoopSettings".into()); }

    let has_secrets = profile
        .scoop_config
        .as_ref()
        .map(|c| c.contains_key("virustotal_api_key"))
        .unwrap_or(false);

    // Count apps/buckets leniently — skip malformed entries but still report.
    let (app_count, app_skipped) = match profile.apps.as_deref() {
        Some(list) => {
            let (ok, skipped) = lenient_list::<ProfileApp>(list);
            (ok.len(), skipped)
        }
        None => (0, 0),
    };
    let (bucket_count, bucket_skipped) = match profile.buckets.as_deref() {
        Some(list) => {
            let (ok, skipped) = lenient_list::<ProfileBucket>(list);
            (ok.len(), skipped)
        }
        None => (0, 0),
    };
    if app_skipped > 0 {
        warnings.push(format!("{} app entry/entries had an unfamiliar shape and were skipped.", app_skipped));
    }
    if bucket_skipped > 0 {
        warnings.push(format!("{} bucket entry/entries had an unfamiliar shape and were skipped.", bucket_skipped));
    }

    Ok(ProfileSummary {
        schema: profile.schema,
        exported_at: profile.exported_at,
        valid: true,
        groups_present,
        app_count,
        bucket_count,
        hold_count: profile.holds.as_ref().map(|v| v.len()).unwrap_or(0),
        setting_count: profile
            .rscoop_settings
            .as_ref()
            .map(|m| m.len())
            .unwrap_or(0),
        has_scoop_config: profile.scoop_config.is_some(),
        has_secrets,
        warnings,
    })
}

#[derive(Debug, Serialize)]
pub struct ImportResult {
    pub applied_groups: Vec<String>,
    pub settings_applied: usize,
    pub scoop_config_keys_applied: usize,
    /// Buckets successfully cloned in this call (synchronous, pre-queue).
    pub buckets_added: usize,
    /// Buckets we tried to add but failed (message in `notes`).
    pub buckets_failed: usize,
    /// Number of Install operations pushed onto the ops queue. The ops
    /// manager owns their progress from here — the frontend watches its
    /// existing operations modal rather than this result.
    pub apps_queued: usize,
    pub notes: Vec<String>,
}

/// Apply the selected groups from a profile JSON to the current machine.
///
/// Execution model, in order:
///   1. `rscoop_settings` — write recognized keys into the Tauri store.
///   2. `scoop_config` — merge into scoop's `config.json`.
///   3. `buckets` — clone each bucket via git2 (synchronous, fast). Must
///      happen before apps so installers can resolve manifests.
///   4. `apps` — push one `Install` onto the ops queue per app, skipping
///      anything already installed. The queue runs them FIFO in the
///      background; the existing OperationModal surfaces progress.
///   5. `holds` — apply to already-installed packages only. Anything not
///      installed yet is deferred (it'll be held manually or after install).
///
/// Import is strictly additive: nothing is uninstalled, and existing
/// settings overwritten by the import can be recovered from a pre-import
/// profile if the user kept one.
#[tauri::command]
pub async fn import_profile(
    app: AppHandle,
    state: State<'_, AppState>,
    json: String,
    groups: Vec<String>,
) -> Result<ImportResult, String> {
    log::info!("Importing profile, groups={:?}", groups);

    let (profile, warnings) = parse_profile_lenient(&json)?;

    let want = |id: &str| groups.iter().any(|g| g == id);

    let mut result = ImportResult {
        applied_groups: Vec::new(),
        settings_applied: 0,
        scoop_config_keys_applied: 0,
        buckets_added: 0,
        buckets_failed: 0,
        apps_queued: 0,
        notes: warnings,
    };

    // rScoop settings.
    if want("rscoopSettings") {
        if let Some(settings) = profile.rscoop_settings.as_ref() {
            let store = app
                .store(PathBuf::from(STORE_PATH))
                .map_err(|e| e.to_string())?;
            for (key, value) in settings {
                // Only write keys we recognize — ignore anything unknown so a
                // malicious or stale profile can't stuff arbitrary data into
                // the store.
                let recognized = RSCOOP_SETTING_KEYS.iter().any(|k| k == key)
                    || key == "scoop_path";
                if recognized {
                    store.set(key, value.clone());
                    result.settings_applied += 1;
                } else {
                    result.notes.push(format!("Skipped unknown key: {}", key));
                }
            }
            store.save().map_err(|e| e.to_string())?;
            result.applied_groups.push("rscoopSettings".into());
        } else {
            result.notes.push("rScoop settings requested but not present in profile.".into());
        }
    }

    // Scoop global config.
    if want("scoopConfig") {
        if let Some(incoming) = profile.scoop_config.as_ref() {
            let mut current = read_scoop_config_file()?;
            for (k, v) in incoming {
                current.insert(k.clone(), v.clone());
                result.scoop_config_keys_applied += 1;
            }
            write_scoop_config_file(&current)?;
            result.applied_groups.push("scoopConfig".into());
        } else {
            result.notes.push("Scoop config requested but not present in profile.".into());
        }
    }

    // Buckets — clone each one synchronously. Must run before apps so
    // manifests are resolvable. Already-present buckets no-op cleanly.
    if want("buckets") {
        if let Some(list) = profile.buckets.as_deref() {
            let (parsed, skipped) = lenient_list::<ProfileBucket>(list);
            if skipped > 0 {
                result.notes.push(format!("{} bucket entries were malformed and skipped.", skipped));
            }
            for b in parsed {
                if b.name.is_empty() || b.source.is_empty() {
                    continue;
                }
                let res = install_bucket(BucketInstallOptions {
                    name: b.name.clone(),
                    url: b.source.clone(),
                    force: false,
                })
                .await
                .unwrap_or_else(|e| crate::commands::bucket_install::BucketInstallResult {
                    success: false,
                    message: e,
                    bucket_name: b.name.clone(),
                    bucket_path: None,
                    manifest_count: None,
                });
                if res.success {
                    result.buckets_added += 1;
                } else {
                    result.buckets_failed += 1;
                    result.notes.push(format!("Bucket '{}' failed: {}", b.name, res.message));
                }
            }
            result.applied_groups.push("buckets".into());
        }
    }

    // Apps — push an Install onto the ops queue for each app not already
    // present. We intentionally don't await completion here; the ops modal
    // owns progress display.
    if want("apps") {
        if let Some(list) = profile.apps.as_deref() {
            let (parsed, skipped) = lenient_list::<ProfileApp>(list);
            if skipped > 0 {
                result.notes.push(format!("{} app entries were malformed and skipped.", skipped));
            }
            let installed = get_installed_packages_full(app.clone(), state.clone())
                .await
                .unwrap_or_default();
            let already: std::collections::HashSet<String> =
                installed.iter().map(|p| p.name.clone()).collect();

            for a in parsed {
                if a.name.is_empty() || a.source.is_empty() {
                    continue;
                }
                if already.contains(&a.name) {
                    continue;
                }
                // Preserve versioned installs (scoop install pkg@version)
                // as versioned installs — that was the user's deliberate
                // intent on the source machine. For everything else install
                // the latest manifest so the app stays updatable; otherwise
                // passing a version pins the package and blocks updates.
                let version = if a.versioned && !a.version.is_empty() {
                    Some(a.version)
                } else {
                    None
                };
                operations::enqueue(
                    &app,
                    EnqueueAction::Install {
                        package: a.name,
                        bucket: a.source,
                        version,
                    },
                );
                result.apps_queued += 1;
            }
            if result.apps_queued > 0 {
                result.applied_groups.push("apps".into());
            }
        }
    }

    // Holds — apply only to packages that are already installed. Anything
    // in the profile that wasn't installed locally (and isn't being queued
    // right now) is surfaced so the user can hold it manually after the
    // queue drains.
    if want("holds") {
        if let Some(list) = profile.holds.as_deref() {
            let installed = get_installed_packages_full(app.clone(), state.clone())
                .await
                .unwrap_or_default();
            let installed_names: std::collections::HashSet<&str> =
                installed.iter().map(|p| p.name.as_str()).collect();

            let mut held = 0usize;
            let mut deferred = Vec::new();
            for name in list {
                if name.is_empty() {
                    continue;
                }
                if installed_names.contains(name.as_str()) {
                    // Re-use the existing hold pathway.
                    if crate::commands::hold::hold_package(app.clone(), state.clone(), name.clone())
                        .await
                        .is_ok()
                    {
                        held += 1;
                    }
                } else {
                    deferred.push(name.clone());
                }
            }
            if held > 0 {
                result.applied_groups.push("holds".into());
                result.notes.push(format!("{} packages held.", held));
            }
            if !deferred.is_empty() {
                result.notes.push(format!(
                    "{} holds deferred — those packages aren't installed yet (after installs finish, hold them from the Installed page).",
                    deferred.len()
                ));
            }
        }
    }

    Ok(result)
}


//! Upstream manifest review detection and notification navigation.
use crate::{operations, state::AppState, utils};
use git2::{Repository, Tree};
use serde::Serialize;
use std::{fs, path::Path, sync::Mutex};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestReviewTarget {
    pub package_name: String,
    pub bucket: String,
}

#[derive(Default)]
pub struct UpstreamManifest {
    pub content: Option<String>,
    pub changed: bool,
    pub removed: bool,
}

fn text_equal(a: &str, b: &str) -> bool {
    a.trim_start_matches('\u{feff}').replace("\r\n", "\n")
        == b.trim_start_matches('\u{feff}').replace("\r\n", "\n")
}

fn blob_content(repo: &Repository, tree: &Tree<'_>, path: &Path) -> Option<String> {
    let entry = tree.get_path(path).ok()?;
    String::from_utf8(repo.find_blob(entry.id()).ok()?.content().to_vec()).ok()
}

fn upstream_trees(repo: &Repository) -> Option<(Tree<'_>, Tree<'_>)> {
    let head = repo.head().ok()?;
    let local = head.peel_to_commit().ok()?;
    let remote = repo
        .find_reference(&format!("refs/remotes/origin/{}", head.shorthand().ok()?))
        .ok()?
        .peel_to_commit()
        .ok()?;
    let base = repo
        .find_commit(repo.merge_base(local.id(), remote.id()).ok()?)
        .ok()?;
    Some((base.tree().ok()?, remote.tree().ok()?))
}

pub fn upstream_manifest(path: &Path, local_content: &str) -> UpstreamManifest {
    let read = || -> Option<UpstreamManifest> {
        let repo = Repository::discover(path.parent()?).ok()?;
        let root = repo.workdir()?.canonicalize().ok()?;
        let relative = path.strip_prefix(root).ok()?;
        let (base, remote) = upstream_trees(&repo)?;
        let before = base.get_path(relative).ok().map(|e| e.id());
        let after = remote.get_path(relative).ok().map(|e| e.id());
        let content = blob_content(&repo, &remote, relative);
        let removed = before.is_some() && after.is_none();
        let changed = before != after
            && (removed
                || content
                    .as_ref()
                    .is_some_and(|upstream| !text_equal(local_content, upstream)));
        Some(UpstreamManifest {
            content,
            changed,
            removed,
        })
    };
    read().unwrap_or_default()
}

pub fn bucket_conflicts(bucket_path: &Path, bucket: &str) -> Vec<ManifestReviewTarget> {
    let scan = || -> Option<Vec<ManifestReviewTarget>> {
        let root = bucket_path.canonicalize().ok()?;
        let repo = Repository::open(&root).ok()?;
        let (base, remote) = upstream_trees(&repo)?;
        let diff = repo
            .diff_tree_to_tree(Some(&base), Some(&remote), None)
            .ok()?;
        let mut targets = Vec::new();
        for delta in diff.deltas() {
            let Some(relative) = delta.old_file().path().or_else(|| delta.new_file().path()) else {
                continue;
            };
            if relative.extension().and_then(|ext| ext.to_str()) != Some("json") {
                continue;
            }
            let Ok(path) = root.join(relative).canonicalize() else {
                continue;
            };
            if !path.starts_with(&root) {
                continue;
            }
            let Ok(content) = fs::read_to_string(&path) else {
                continue;
            };
            let original = blob_content(&repo, &base, relative);
            let upstream = blob_content(&repo, &remote, relative);
            // A clean file waiting behind another conflict does not need its
            // own warning. Only report locally changed, overlapping manifests.
            if original
                .as_ref()
                .is_some_and(|text| text_equal(&content, text))
                || upstream
                    .as_ref()
                    .is_some_and(|text| text_equal(&content, text))
            {
                continue;
            }
            let Some(name) = relative.file_stem().and_then(|name| name.to_str()) else {
                continue;
            };
            if utils::find_manifest_in_bucket(&root, name)
                .and_then(|found| found.canonicalize().ok())
                .as_ref()
                != Some(&path)
            {
                continue;
            }
            targets.push(ManifestReviewTarget {
                package_name: name.into(),
                bucket: bucket.into(),
            });
        }
        targets.sort_by(|a, b| a.package_name.cmp(&b.package_name));
        targets.dedup_by(|a, b| a.package_name == b.package_name);
        Some(targets)
    };
    scan().unwrap_or_default()
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ManifestUpdate {
    bucket: Option<String>,
    conflicts: Vec<ManifestReviewTarget>,
}

/// Called after both native bucket updates and Scoop's own install/update pulls.
pub async fn after_update(app: &AppHandle, bucket: Option<String>) {
    let root = app.state::<AppState>().scoop_path().join("buckets");
    let selected = bucket.clone();
    let conflicts = tauri::async_runtime::spawn_blocking(move || {
        let names = selected.map(|name| vec![name]).unwrap_or_else(|| {
            fs::read_dir(&root)
                .into_iter()
                .flatten()
                .filter_map(Result::ok)
                .filter_map(|entry| entry.file_name().into_string().ok())
                .collect()
        });
        names
            .into_iter()
            .flat_map(|name| {
                utils::validate_scoop_child_dir(&root, &name, "Bucket")
                    .ok()
                    .map(|path| bucket_conflicts(&path, &name))
                    .unwrap_or_default()
            })
            .collect::<Vec<_>>()
    })
    .await
    .unwrap_or_default();
    let active = operations::has_active_work(app);
    if active {
        for target in &conflicts {
            operations::push_operation_warning(
                app,
                operations::OperationWarning {
                    code: "scoop.manifest.upstream_changed".into(),
                    message: format!(
                        "{}/{}: upstream changed; local manifest edits were kept.",
                        target.bucket, target.package_name
                    ),
                    manifest: Some(target.clone()),
                },
            );
        }
    } else if let Some(target) = conflicts.first() {
        operations::notify_manifest_review(app, target.clone());
    }
    let _ = app.emit(
        "manifest-upstream-updated",
        ManifestUpdate { bucket, conflicts },
    );
}

static PENDING_REVIEW: Mutex<Option<ManifestReviewTarget>> = Mutex::new(None);

pub fn request_review(app: &AppHandle, target: ManifestReviewTarget) {
    if let Ok(mut pending) = PENDING_REVIEW.lock() {
        *pending = Some(target);
    }
    crate::tray::show_or_create_main_window(app);
    let _ = app.emit("manifest-review-requested", ());
}

#[tauri::command]
pub fn consume_pending_manifest_review() -> Option<ManifestReviewTarget> {
    PENDING_REVIEW.lock().ok()?.take()
}

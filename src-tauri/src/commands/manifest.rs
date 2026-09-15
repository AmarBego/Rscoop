//! Read and edit the exact Scoop manifest displayed in the package dialog.
use crate::commands::{installed, search, settings};
use crate::state::AppState;
use crate::utils;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

pub(super) static MANIFEST_WRITES: Mutex<()> = Mutex::new(());
const EDITOR_KEY: &str = "manifest.editorPath";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestBackup {
    name: String,
    modified_at: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestDocument {
    content: String,
    path: String,
    bucket: Option<String>,
    installed_copy: bool,
    upstream_content: Option<String>,
    upstream_changed: bool,
    upstream_removed: bool,
    latest_backup: Option<ManifestBackup>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestSaveResult {
    document: ManifestDocument,
    backup_path: Option<String>,
}

fn validate_name(name: &str) -> Result<(), String> {
    let mut components = Path::new(name).components();
    if name.is_empty()
        || name
            .chars()
            .any(|ch| ch.is_control() || matches!(ch, '/' | '\\' | ':'))
        || !matches!(components.next(), Some(Component::Normal(_)))
        || components.next().is_some()
    {
        return Err(format!("Invalid package or bucket name: {name}"));
    }
    Ok(())
}

fn checked_file(path: PathBuf, parent: &Path) -> Result<PathBuf, String> {
    let path = path
        .canonicalize()
        .map_err(|e| format!("Cannot resolve manifest: {e}"))?;
    if !path.starts_with(parent) || !path.is_file() {
        return Err("Manifest is outside the selected Scoop package or bucket".into());
    }
    Ok(path)
}

/// A specified bucket never falls through to a different bucket with a package
/// of the same name. Installed `current` junctions are allowed within the app.
pub(super) fn resolve_manifest(
    root: &Path,
    name: &str,
    bucket: &str,
) -> Result<(PathBuf, Option<String>), String> {
    validate_name(name)?;
    let bucket = bucket.strip_suffix(" (missing)").unwrap_or(bucket);
    let selected_bucket = utils::is_valid_bucket(bucket);
    if selected_bucket {
        validate_name(bucket)?;
    }
    let buckets_dir = root.join("buckets");
    let mut buckets = if selected_bucket {
        vec![bucket.to_string()]
    } else {
        fs::read_dir(&buckets_dir)
            .into_iter()
            .flatten()
            .filter_map(Result::ok)
            .filter_map(|entry| entry.file_name().into_string().ok())
            .collect::<Vec<_>>()
    };
    buckets.sort();
    for bucket in buckets {
        if !buckets_dir.join(&bucket).is_dir() {
            continue;
        }
        let bucket_dir = utils::validate_scoop_child_dir(&buckets_dir, &bucket, "Bucket")?;
        if let Some(path) = utils::find_manifest_in_bucket(&bucket_dir, name) {
            return Ok((checked_file(path, &bucket_dir)?, Some(bucket)));
        }
    }
    let app_dir =
        utils::validate_scoop_child_dir(&root.join("apps"), name, "Package").map_err(|_| {
            format!("No manifest found for {name} in the selected bucket or installed package")
        })?;
    Ok((
        checked_file(app_dir.join("current/manifest.json"), &app_dir)?,
        None,
    ))
}

fn display_path(path: &Path) -> String {
    let path = path.to_string_lossy();
    if let Some(unc) = path.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{unc}")
    } else {
        path.strip_prefix(r"\\?\").unwrap_or(&path).to_string()
    }
}

fn read_document(root: &Path, name: &str, bucket: &str) -> Result<ManifestDocument, String> {
    let (path, bucket) = resolve_manifest(root, name, bucket)?;
    let content = fs::read_to_string(&path).map_err(|e| format!("Cannot read manifest: {e}"))?;
    let upstream = if bucket.is_some() {
        crate::manifest_review::upstream_manifest(&path, &content)
    } else {
        Default::default()
    };
    Ok(ManifestDocument {
        content,
        path: display_path(&path),
        installed_copy: bucket.is_none(),
        upstream_content: upstream.content,
        upstream_changed: upstream.changed,
        upstream_removed: upstream.removed,
        latest_backup: latest_backup(&path),
        bucket,
    })
}

fn backup_prefix(path: &Path) -> String {
    format!(".{}.rscoop-", path.file_name().unwrap().to_string_lossy())
}

fn latest_backup(path: &Path) -> Option<ManifestBackup> {
    let prefix = backup_prefix(path);
    fs::read_dir(path.parent()?)
        .ok()?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let name = entry.file_name().into_string().ok()?;
            if !name.starts_with(&prefix)
                || !name.ends_with(".bak")
                || !entry.file_type().ok()?.is_file()
            {
                return None;
            }
            let modified = entry.metadata().ok()?.modified().ok()?;
            let modified_at = modified
                .duration_since(std::time::UNIX_EPOCH)
                .ok()?
                .as_millis() as u64;
            Some((modified, ManifestBackup { name, modified_at }))
        })
        .max_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.name.cmp(&b.1.name)))
        .map(|(_, backup)| backup)
}

fn read_backup(path: &Path, backup_name: &str) -> Result<String, String> {
    validate_name(backup_name)?;
    if !backup_name.starts_with(&backup_prefix(path)) || !backup_name.ends_with(".bak") {
        return Err("This backup does not belong to the selected manifest.".into());
    }
    let parent = path.parent().ok_or("Manifest has no parent directory")?;
    let backup = parent.join(backup_name);
    if !fs::symlink_metadata(&backup)
        .map_err(|e| e.to_string())?
        .file_type()
        .is_file()
    {
        return Err("The backup must be a regular file.".into());
    }
    let backup = checked_file(backup, parent)?;
    fs::read_to_string(backup).map_err(|e| format!("Cannot read manifest backup: {e}"))
}

fn verify_snapshot(
    document: &ManifestDocument,
    expected_path: &str,
    original: &str,
) -> Result<(), String> {
    if document.path != expected_path || document.content != original {
        return Err("The manifest changed on disk or now resolves to a different file. Reload it before saving; your draft has been kept.".into());
    }
    Ok(())
}

fn validate_content(content: &str) -> Result<(), String> {
    let value: serde_json::Value = serde_json::from_str(content.trim_start_matches('\u{feff}'))
        .map_err(|e| format!("Invalid JSON: {e}"))?;
    if !value.is_object()
        || value
            .get("version")
            .and_then(|v| v.as_str())
            .is_none_or(|v| v.trim().is_empty())
    {
        return Err(
            "A Scoop manifest must be a JSON object with a non-empty version string.".into(),
        );
    }
    Ok(())
}

/// Preserve the original newline convention and UTF-8 BOM when the textarea
/// normalizes its contents. Otherwise leave the user's formatting intact.
fn preserve_text_format(content: &str, original: &str) -> String {
    let mut content = content.trim_start_matches('\u{feff}').replace("\r\n", "\n");
    if original.contains("\r\n") {
        content = content.replace('\n', "\r\n");
    }
    if original.starts_with('\u{feff}') {
        content.insert(0, '\u{feff}');
    }
    content
}

/// Unique .bak names preserve earlier backups and are ignored by Scoop's JSON
/// discovery. Never overwrite a pre-existing file or follow a backup symlink.
fn backup_manifest(path: &Path, content: &str) -> Result<String, String> {
    let prefix = backup_prefix(path);
    let mut backup = tempfile::Builder::new()
        .prefix(&prefix)
        .suffix(".bak")
        .tempfile_in(path.parent().unwrap())
        .map_err(|e| format!("Cannot create manifest backup: {e}"))?;
    backup
        .write_all(content.as_bytes())
        .map_err(|e| format!("Cannot write manifest backup: {e}"))?;
    backup
        .as_file()
        .sync_all()
        .map_err(|e| format!("Cannot flush manifest backup: {e}"))?;
    let (_, backup_path) = backup
        .keep()
        .map_err(|e| format!("Cannot keep manifest backup: {e}"))?;
    Ok(display_path(&backup_path))
}

fn save_document(
    root: &Path,
    name: &str,
    bucket: &str,
    expected_path: &str,
    original: &str,
    content: &str,
) -> Result<ManifestSaveResult, String> {
    validate_content(content)?;
    let _guard = MANIFEST_WRITES.lock().map_err(|e| e.to_string())?;
    let document = read_document(root, name, bucket)?;
    verify_snapshot(&document, expected_path, original)?;
    let content = preserve_text_format(content, original);
    if content == original {
        return Ok(ManifestSaveResult {
            document,
            backup_path: None,
        });
    }
    let (path, _) = resolve_manifest(root, name, bucket)?;
    let permissions = fs::metadata(&path)
        .map_err(|e| e.to_string())?
        .permissions();
    if permissions.readonly() {
        return Err("This manifest is read-only.".into());
    }
    let mut pending = tempfile::Builder::new()
        .prefix(".rscoop-manifest-")
        .suffix(".tmp")
        .tempfile_in(path.parent().unwrap())
        .map_err(|e| format!("Cannot prepare manifest save: {e}"))?;
    pending
        .write_all(content.as_bytes())
        .map_err(|e| format!("Cannot write manifest: {e}"))?;
    pending
        .as_file()
        .set_permissions(permissions)
        .map_err(|e| e.to_string())?;
    pending.as_file().sync_all().map_err(|e| e.to_string())?;
    let backup_path = backup_manifest(&path, original)?;
    // Recheck after preparing the replacement; external editors and bucket
    // updates may have changed the file since the user entered edit mode.
    verify_snapshot(&read_document(root, name, bucket)?, expected_path, original)?;
    pending
        .persist(&path)
        .map_err(|e| format!("Cannot replace manifest (backup: {backup_path}): {e}"))?;
    let upstream = if document.bucket.is_some() {
        crate::manifest_review::upstream_manifest(&path, &content)
    } else {
        Default::default()
    };
    Ok(ManifestSaveResult {
        document: ManifestDocument {
            content,
            upstream_content: upstream.content,
            upstream_changed: upstream.changed,
            upstream_removed: upstream.removed,
            latest_backup: latest_backup(&path),
            ..document
        },
        backup_path: Some(backup_path),
    })
}

/// Fetches the manifest content for a given package from a specific bucket.
///
/// # Arguments
/// * `app` - The Tauri application handle.
/// * `package_name` - The name of the package to fetch the manifest for.
/// * `bucket` - The name of the bucket where the package is located. If empty or "None",
///              it will search in all available buckets.
#[tauri::command]
pub fn get_package_manifest(
    state: State<'_, AppState>,
    package_name: String,
    bucket: String,
) -> Result<String, String> {
    read_document(&state.scoop_path(), &package_name, &bucket).map(|document| document.content)
}

#[tauri::command]
pub async fn get_package_manifest_document(
    state: State<'_, AppState>,
    package_name: String,
    bucket: String,
    known_content: Option<String>,
) -> Result<ManifestDocument, String> {
    let root = state.scoop_path();
    let read_root = root.clone();
    let document = tauri::async_runtime::spawn_blocking(move || {
        read_document(&read_root, &package_name, &bucket)
    })
    .await
    .map_err(|e| e.to_string())??;
    if known_content.is_some_and(|known| known != document.content) {
        installed::invalidate_installed_cache(state).await;
        search::invalidate_manifest_cache(&root).await;
    }
    Ok(document)
}

#[tauri::command]
pub async fn save_package_manifest(
    state: State<'_, AppState>,
    package_name: String,
    bucket: String,
    expected_path: String,
    original_content: String,
    content: String,
) -> Result<ManifestSaveResult, String> {
    let root = state.scoop_path();
    let save_root = root.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        save_document(
            &save_root,
            &package_name,
            &bucket,
            &expected_path,
            &original_content,
            &content,
        )
    })
    .await
    .map_err(|e| e.to_string())??;
    installed::invalidate_installed_cache(state).await;
    search::invalidate_manifest_cache(&root).await;
    Ok(result)
}

#[tauri::command]
pub async fn restore_package_manifest_backup(
    state: State<'_, AppState>,
    package_name: String,
    bucket: String,
    expected_path: String,
    original_content: String,
    backup_name: String,
) -> Result<ManifestSaveResult, String> {
    let (path, _) = resolve_manifest(&state.scoop_path(), &package_name, &bucket)?;
    if display_path(&path) != expected_path {
        return Err(
            "The manifest now resolves to a different file. Reload before restoring.".into(),
        );
    }
    let content = tauri::async_runtime::spawn_blocking(move || read_backup(&path, &backup_name))
        .await
        .map_err(|e| e.to_string())??;
    // Reuse validation, snapshot checks, atomic replacement, and a fresh backup
    // of the current file, so restoring is itself reversible.
    save_package_manifest(
        state,
        package_name,
        bucket,
        expected_path,
        original_content,
        content,
    )
    .await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ManifestEditorMode {
    Preferred,
    Choose,
    Default,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestEditorResult {
    backup_path: String,
    latest_backup: Option<ManifestBackup>,
}

#[tauri::command]
pub async fn open_package_manifest_editor(
    app: AppHandle,
    state: State<'_, AppState>,
    package_name: String,
    bucket: String,
    expected_path: String,
    original_content: String,
    mode: ManifestEditorMode,
    picker_title: String,
) -> Result<Option<ManifestEditorResult>, String> {
    let root = state.scoop_path();
    tauri::async_runtime::spawn_blocking(move || {
        let preferred = settings::get_config_value(app.clone(), EDITOR_KEY.into())?
            .and_then(|value| value.as_str().map(PathBuf::from));
        let editor = match mode {
            ManifestEditorMode::Default => None,
            ManifestEditorMode::Preferred
                if preferred.as_ref().is_some_and(|path| path.is_file()) =>
            {
                preferred
            }
            _ => {
                let Some(file) = app
                    .dialog()
                    .file()
                    .set_title(picker_title)
                    .add_filter("*.exe", &["exe"])
                    .blocking_pick_file()
                else {
                    return Ok(None);
                };
                Some(file.into_path().map_err(|e| e.to_string())?)
            }
        };
        if let Some(editor) = &editor {
            if !editor.is_absolute()
                || !editor.is_file()
                || !editor
                    .extension()
                    .is_some_and(|ext| ext.eq_ignore_ascii_case("exe"))
            {
                return Err("Choose a text editor or IDE executable (.exe).".into());
            }
        }
        let _guard = MANIFEST_WRITES.lock().map_err(|e| e.to_string())?;
        let document = read_document(&root, &package_name, &bucket)?;
        verify_snapshot(&document, &expected_path, &original_content)?;
        let (path, _) = resolve_manifest(&root, &package_name, &bucket)?;
        let backup_path = backup_manifest(&path, &document.content)?;
        if let Some(editor) = editor {
            let mut command = std::process::Command::new(&editor);
            command.arg(&path).current_dir(path.parent().unwrap());
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                command.creation_flags(0x08000000); // CREATE_NO_WINDOW; GUI editors display normally.
            }
            command
                .spawn()
                .map_err(|e| format!("Cannot open editor: {e}"))?;
            if let Err(error) =
                settings::set_config_value(app, EDITOR_KEY.into(), serde_json::json!(editor))
            {
                log::warn!("Editor opened, but could not remember its path: {error}");
            }
        } else {
            app.opener()
                .open_path(display_path(&path), None::<String>)
                .map_err(|e| e.to_string())?;
        }
        Ok(Some(ManifestEditorResult {
            backup_path,
            latest_backup: latest_backup(&path),
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> (tempfile::TempDir, PathBuf) {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("buckets/main/bucket/nested/example.json");
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, "{\r\n  \"version\": \"1.0\"\r\n}\r\n").unwrap();
        (temp, path)
    }

    #[test]
    fn saves_exact_manifest_and_keeps_each_previous_contents_in_a_backup() {
        let (temp, path) = fixture();
        let original = read_document(temp.path(), "example", "main").unwrap();
        let first = save_document(
            temp.path(),
            "example",
            "main",
            &original.path,
            &original.content,
            "{\n  \"version\": \"2.0\"\n}\n",
        )
        .unwrap();
        assert_eq!(
            fs::read_to_string(first.backup_path.as_ref().unwrap()).unwrap(),
            original.content
        );
        assert_eq!(
            fs::read_to_string(&path).unwrap(),
            "{\r\n  \"version\": \"2.0\"\r\n}\r\n"
        );
        let second = save_document(
            temp.path(),
            "example",
            "main",
            &first.document.path,
            &first.document.content,
            r#"{"version":"3.0"}"#,
        )
        .unwrap();
        assert_ne!(first.backup_path, second.backup_path);
        assert_eq!(
            fs::read_to_string(second.backup_path.unwrap()).unwrap(),
            first.document.content
        );
        assert_eq!(
            fs::read_to_string(first.backup_path.unwrap()).unwrap(),
            original.content
        );
        assert_eq!(utils::count_manifests(&temp.path().join("buckets/main")), 1);
    }

    #[test]
    fn restores_a_manifest_backup_and_keeps_the_replaced_contents() {
        let (temp, path) = fixture();
        let original = read_document(temp.path(), "example", "main").unwrap();
        let edited = save_document(
            temp.path(),
            "example",
            "main",
            &original.path,
            &original.content,
            r#"{"version":"edited"}"#,
        )
        .unwrap();
        // Backups are discoverable when the dialog is reopened, not just in UI state.
        let reopened = read_document(temp.path(), "example", "main").unwrap();
        let backup = reopened.latest_backup.unwrap();
        let canonical = path.canonicalize().unwrap();
        let content = read_backup(&canonical, &backup.name).unwrap();
        let restored = save_document(
            temp.path(),
            "example",
            "main",
            &edited.document.path,
            &edited.document.content,
            &content,
        )
        .unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), original.content);
        assert_eq!(
            fs::read_to_string(restored.backup_path.unwrap()).unwrap(),
            edited.document.content
        );
        assert!(read_backup(&canonical, "../outside.bak").is_err());
        assert!(read_backup(&canonical, ".other.json.rscoop-test.bak").is_err());
    }

    #[test]
    fn rejects_invalid_json_and_stale_content_without_changing_the_file() {
        let (temp, path) = fixture();
        let original = read_document(temp.path(), "example", "main").unwrap();
        for content in ["{", "[]", "null", r#"{"version":42}"#, r#"{"version":" "}"#] {
            assert!(save_document(
                temp.path(),
                "example",
                "main",
                &original.path,
                &original.content,
                content
            )
            .is_err());
            assert_eq!(fs::read_to_string(&path).unwrap(), original.content);
        }
        let external = r#"{"version":"external"}"#;
        fs::write(&path, external).unwrap();
        assert!(save_document(
            temp.path(),
            "example",
            "main",
            &original.path,
            &original.content,
            r#"{"version":"draft"}"#
        )
        .unwrap_err()
        .contains("changed on disk"));
        assert_eq!(fs::read_to_string(&path).unwrap(), external);
        assert_eq!(fs::read_dir(path.parent().unwrap()).unwrap().count(), 1);
    }

    #[test]
    fn refuses_a_different_manifest_path_or_a_different_bucket() {
        let (temp, path) = fixture();
        let doc = read_document(temp.path(), "example", "main").unwrap();
        assert!(save_document(
            temp.path(),
            "example",
            "main",
            "C:\\unrelated.json",
            &doc.content,
            r#"{"version":"2.0"}"#
        )
        .is_err());
        assert!(read_document(temp.path(), "example", "extras").is_err());
        assert_eq!(fs::read_to_string(path).unwrap(), doc.content);
    }

    #[test]
    fn rejects_path_traversal_and_manifest_symlinks_outside_the_bucket() {
        let (temp, _) = fixture();
        for name in [
            "../example",
            "..\\example",
            "C:\\example",
            "example:stream",
            "..",
            "",
        ] {
            assert!(resolve_manifest(temp.path(), name, "main").is_err());
            assert!(resolve_manifest(temp.path(), "example", name).is_err() || name.is_empty());
        }
        #[cfg(windows)]
        {
            let outside = temp.path().join("outside.json");
            fs::write(&outside, r#"{"version":"1"}"#).unwrap();
            let link = temp.path().join("buckets/main/bucket/linked.json");
            match std::os::windows::fs::symlink_file(&outside, &link) {
                Ok(()) => assert!(resolve_manifest(temp.path(), "linked", "main").is_err()),
                Err(e) if e.raw_os_error() == Some(1314) => {
                    eprintln!("symlink test requires Developer Mode")
                }
                Err(e) => panic!("cannot create test symlink: {e}"),
            }
        }
    }

    #[test]
    fn identifies_installed_fallback_and_preserves_bom() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("apps/example/current/manifest.json");
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, "\u{feff}{\"version\":\"1.0\"}").unwrap();
        let doc = read_document(temp.path(), "example", "missing").unwrap();
        assert!(doc.installed_copy);
        let saved = save_document(
            temp.path(),
            "example",
            "missing",
            &doc.path,
            &doc.content,
            r#"{"version":"2.0"}"#,
        )
        .unwrap();
        assert!(saved.document.content.starts_with('\u{feff}'));
        assert!(fs::read_to_string(saved.backup_path.unwrap())
            .unwrap()
            .starts_with('\u{feff}'));
    }

    #[test]
    fn can_repair_broken_json_and_skips_backup_for_unchanged_saves() {
        let (temp, path) = fixture();
        fs::write(&path, "{broken").unwrap();
        let doc = read_document(temp.path(), "example", "main").unwrap();
        let repaired = save_document(
            temp.path(),
            "example",
            "main",
            &doc.path,
            &doc.content,
            r#"{"version":"1.0"}"#,
        )
        .unwrap();
        assert_eq!(
            fs::read_to_string(repaired.backup_path.unwrap()).unwrap(),
            "{broken"
        );
        let unchanged = save_document(
            temp.path(),
            "example",
            "main",
            &doc.path,
            &repaired.document.content,
            &repaired.document.content,
        )
        .unwrap();
        assert!(unchanged.backup_path.is_none());
    }

    #[test]
    fn reads_last_fetched_upstream_without_changing_the_local_manifest() {
        let (temp, path) = fixture();
        let bucket = temp.path().join("buckets/main");
        let mut options = git2::RepositoryInitOptions::new();
        options.initial_head("main");
        let repo = git2::Repository::init_opts(&bucket, &options).unwrap();
        let signature = git2::Signature::now("rScoop test", "test@example.invalid").unwrap();
        let mut index = repo.index().unwrap();
        index
            .add_path(Path::new("bucket/nested/example.json"))
            .unwrap();
        let tree = repo.find_tree(index.write_tree().unwrap()).unwrap();
        let initial = repo
            .commit(Some("HEAD"), &signature, &signature, "initial", &tree, &[])
            .unwrap();
        let upstream = r#"{"version":"2.0"}"#;
        fs::write(&path, upstream).unwrap();
        index
            .add_path(Path::new("bucket/nested/example.json"))
            .unwrap();
        let tree = repo.find_tree(index.write_tree().unwrap()).unwrap();
        let remote = repo
            .commit(
                None,
                &signature,
                &signature,
                "upstream",
                &tree,
                &[&repo.find_commit(initial).unwrap()],
            )
            .unwrap();
        repo.reference("refs/remotes/origin/main", remote, false, "test fetch")
            .unwrap();
        let local = r#"{"version":"local fix"}"#;
        fs::write(&path, local).unwrap();

        let doc = read_document(temp.path(), "example", "main").unwrap();
        assert_eq!(doc.content, local);
        assert_eq!(doc.upstream_content.as_deref(), Some(upstream));
        assert!(doc.upstream_changed);
        assert!(!doc.upstream_removed);
        assert_eq!(fs::read_to_string(&path).unwrap(), local);
        assert_eq!(repo.head().unwrap().target(), Some(initial));
        fs::write(&path, upstream).unwrap();
        assert!(
            !read_document(temp.path(), "example", "main")
                .unwrap()
                .upstream_changed
        );
        // Local edits alone are not an upstream-change notification.
        repo.reference(
            "refs/remotes/origin/main",
            initial,
            true,
            "test unchanged remote",
        )
        .unwrap();
        fs::write(&path, local).unwrap();
        assert!(
            !read_document(temp.path(), "example", "main")
                .unwrap()
                .upstream_changed
        );
    }
}

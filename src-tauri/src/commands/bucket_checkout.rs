//! Recovery for the filesystem half of a bucket fast-forward. Git reference
//! transactions do not roll back checkouts or the index.
use git2::{Commit, Repository};
use serde::Serialize;
use std::collections::BTreeMap;
use std::fs;
use std::io;
use std::path::{Component, Path, PathBuf};

#[derive(Serialize)]
enum SavedPath {
    Missing,
    Directory,
    File,
    Symlink { target: PathBuf, directory: bool },
}

pub(super) struct CheckoutSnapshot {
    root: PathBuf,
    storage: tempfile::TempDir,
    paths: BTreeMap<PathBuf, SavedPath>,
    index_path: PathBuf,
    had_index: bool,
}

fn metadata(path: &Path) -> io::Result<Option<fs::Metadata>> {
    match fs::symlink_metadata(path) {
        Ok(metadata) => Ok(Some(metadata)),
        Err(error)
            if matches!(
                error.kind(),
                io::ErrorKind::NotFound | io::ErrorKind::NotADirectory
            ) =>
        {
            Ok(None)
        }
        Err(error) => Err(error),
    }
}

fn directory_link(metadata: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::FileTypeExt;
        metadata.file_type().is_symlink_dir()
    }
    #[cfg(not(windows))]
    {
        let _ = metadata;
        false
    }
}

// Never recursively delete during recovery: unexpected new files must survive.
fn remove_path(path: &Path, metadata: &fs::Metadata) -> io::Result<()> {
    if metadata.is_dir() || directory_link(metadata) {
        fs::remove_dir(path)
    } else {
        fs::remove_file(path)
    }
}

fn restore_file(backup: &Path, path: &Path) -> io::Result<()> {
    let permissions = fs::metadata(backup)?.permissions();
    if metadata(path)?
        .is_some_and(|current| current.is_file() && current.permissions() == permissions)
        && fs::read(path)? == fs::read(backup)?
    {
        return Ok(());
    }
    let pending = tempfile::NamedTempFile::new_in(path.parent().unwrap())?;
    fs::copy(backup, pending.path())?;
    pending.persist(path).map_err(|error| error.error)?;
    Ok(())
}

impl CheckoutSnapshot {
    pub(super) fn prepare(
        repo: &Repository,
        local: &Commit<'_>,
        remote: &Commit<'_>,
    ) -> Result<Self, String> {
        let prepare = || -> Result<Self, Box<dyn std::error::Error>> {
            let root = repo
                .workdir()
                .ok_or("Bucket has no working directory")?
                .canonicalize()?;
            let index_path = repo
                .index()?
                .path()
                .ok_or("Bucket index has no path")?
                .to_path_buf();
            let storage = tempfile::Builder::new()
                .prefix("rscoop-checkout-")
                .tempdir_in(repo.path())?;
            let had_index = metadata(&index_path)?.is_some();
            if had_index {
                fs::copy(&index_path, storage.path().join("index"))?;
            }
            let mut snapshot = Self {
                root,
                storage,
                paths: BTreeMap::new(),
                index_path,
                had_index,
            };
            let diff = repo.diff_tree_to_tree(Some(&local.tree()?), Some(&remote.tree()?), None)?;
            for delta in diff.deltas() {
                for relative in [delta.old_file().path(), delta.new_file().path()]
                    .into_iter()
                    .flatten()
                {
                    if relative.as_os_str().is_empty() || relative.components().any(|part| !matches!(part, Component::Normal(name) if !name.eq_ignore_ascii_case(".git"))) {
                        return Err("Unsafe path in bucket update".into());
                    }
                    let mut parents = relative
                        .ancestors()
                        .skip(1)
                        .filter(|p| !p.as_os_str().is_empty())
                        .collect::<Vec<_>>();
                    parents.reverse();
                    for parent in parents {
                        snapshot.capture(parent, false)?;
                        if matches!(snapshot.paths.get(parent), Some(SavedPath::Symlink { .. })) {
                            return Err("Bucket update traverses a symbolic link".into());
                        }
                    }
                    snapshot.capture(relative, true)?;
                }
            }
            // Leave a human-readable inventory if recovery itself encounters an
            // I/O failure; the original bytes are alongside it, outside the worktree.
            serde_json::to_writer_pretty(
                fs::File::create(snapshot.storage.path().join("paths.json"))?,
                &snapshot.paths,
            )?;
            Ok(snapshot)
        };
        prepare()
            .map_err(|error| format!("Cannot prepare bucket rollback; no files changed: {error}"))
    }

    fn capture(&mut self, relative: &Path, recursive: bool) -> io::Result<()> {
        let path = self.root.join(relative);
        if !self.paths.contains_key(relative) {
            let saved = match metadata(&path)? {
                None => SavedPath::Missing,
                Some(meta) if meta.file_type().is_symlink() => SavedPath::Symlink {
                    target: fs::read_link(&path)?,
                    directory: directory_link(&meta),
                },
                Some(meta) if meta.is_dir() => SavedPath::Directory,
                Some(meta) if meta.is_file() => {
                    let backup = self.storage.path().join("worktree").join(relative);
                    fs::create_dir_all(backup.parent().unwrap())?;
                    fs::copy(&path, backup)?;
                    SavedPath::File
                }
                Some(_) => return Err(io::Error::other("Unsupported file type in bucket update")),
            };
            self.paths.insert(relative.to_path_buf(), saved);
        }
        if recursive && matches!(self.paths.get(relative), Some(SavedPath::Directory)) {
            for entry in fs::read_dir(path)? {
                self.capture(&relative.join(entry?.file_name()), true)?;
            }
        }
        Ok(())
    }

    fn restore(&self, repo: &Repository) -> Result<(), Box<dyn std::error::Error>> {
        // Do not follow an external directory-link replacement during recovery.
        for relative in self.paths.keys() {
            for parent in relative
                .ancestors()
                .skip(1)
                .filter(|p| !p.as_os_str().is_empty())
            {
                if metadata(&self.root.join(parent))?
                    .is_some_and(|meta| meta.file_type().is_symlink())
                {
                    return Err(
                        "A bucket directory became a symbolic link during the update".into(),
                    );
                }
            }
        }
        // Remove newly added paths / changed types, children first. A nonempty
        // unexpected directory stops recovery instead of deleting somebody's work.
        for (relative, saved) in self.paths.iter().rev() {
            let path = self.root.join(relative);
            let Some(current) = metadata(&path)? else {
                continue;
            };
            let compatible = match saved {
                SavedPath::Directory => current.is_dir(),
                SavedPath::File => current.is_file(),
                SavedPath::Symlink { target, directory } => {
                    current.file_type().is_symlink()
                        && directory_link(&current) == *directory
                        && fs::read_link(&path)? == *target
                }
                SavedPath::Missing => false,
            };
            if !compatible {
                remove_path(&path, &current)?;
            }
        }
        // Parents sort before their children, so original directory/file type
        // changes can be restored without a forced Git checkout.
        for (relative, saved) in &self.paths {
            let path = self.root.join(relative);
            match saved {
                SavedPath::Missing => {}
                SavedPath::Directory => {
                    if metadata(&path)?.is_none() {
                        fs::create_dir(&path)?;
                    }
                }
                SavedPath::File => {
                    restore_file(&self.storage.path().join("worktree").join(relative), &path)?
                }
                SavedPath::Symlink { target, directory } => {
                    if metadata(&path)?.is_none() {
                        #[cfg(windows)]
                        if *directory {
                            std::os::windows::fs::symlink_dir(target, &path)?;
                        } else {
                            std::os::windows::fs::symlink_file(target, &path)?;
                        }
                        #[cfg(unix)]
                        {
                            let _ = directory;
                            std::os::unix::fs::symlink(target, &path)?;
                        }
                    }
                }
            }
        }
        if self.had_index {
            restore_file(&self.storage.path().join("index"), &self.index_path)?;
        } else if metadata(&self.index_path)?.is_some() {
            fs::remove_file(&self.index_path)?;
        }
        repo.index()?.read(true)?;
        Ok(())
    }

    pub(super) fn rollback(self, repo: &Repository, error: &str) -> String {
        match self.restore(repo) {
            Ok(()) => format!("{error}. The previous bucket files and index were restored; local edits were kept."),
            Err(recovery) => self.retain(&format!("{error}. Automatic rollback failed: {recovery}")),
        }
    }

    pub(super) fn retain(self, error: &str) -> String {
        let path = self.storage.keep();
        format!("{error}. Bucket recovery is required before retrying or using its manifests. Original files and index are preserved in {}", path.display())
    }
}

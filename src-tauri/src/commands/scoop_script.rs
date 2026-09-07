use std::path::Path;

const UTF8_OUTPUT_PREAMBLE: &str =
    "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false);";

/// Quote a value as a single-quoted PowerShell string literal. Control
/// characters are replaced with spaces so a crafted value can never break a
/// single-line script apart.
pub(crate) fn ps_quote(value: &str) -> String {
    let sanitized = value
        .chars()
        .map(|ch| if ch.is_control() { ' ' } else { ch })
        .collect::<String>();
    format!("'{}'", sanitized.replace('\'', "''"))
}

/// Prefer the resolved root's shim so operations work when `scoop` is not on
/// PATH (elevated/MSI launches). When the `scoop.ps1` shim is absent — a
/// mis-resolved root, a shim-less global root, or a setup carrying only
/// `scoop.cmd`/`scoop.exe` — or the path is not valid Unicode, fall back to
/// PowerShell's own PATH resolution of `scoop`, which is what worked for
/// those machines before the shim path was introduced.
fn scoop_invocation(scoop_root: &Path) -> String {
    let shim = scoop_root.join("shims").join("scoop.ps1");
    match shim.to_str() {
        Some(path) if shim.is_file() => ps_quote(path),
        _ => "scoop".to_string(),
    }
}

pub(crate) fn build_scoop_script<I, S>(scoop_root: &Path, args: I) -> String
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let mut invocation = vec![scoop_invocation(scoop_root)];
    invocation.extend(args.into_iter().map(|arg| ps_quote(arg.as_ref())));

    // Execra decodes process pipes as UTF-8. PowerShell can otherwise write
    // redirected output using the active console code page, which corrupts
    // localized Scoop output (for example, GBK on a Chinese system).
    format!(
        "{} Import-Module Microsoft.PowerShell.Utility -EA SilentlyContinue; & {}",
        UTF8_OUTPUT_PREAMBLE,
        invocation.join(" ")
    )
}

#[cfg(test)]
mod tests {
    use super::{build_scoop_script, UTF8_OUTPUT_PREAMBLE};
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};
    use std::{env, fs, process};

    struct TempDir {
        path: PathBuf,
    }

    impl TempDir {
        fn new(name: &str) -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system clock before Unix epoch")
                .as_nanos();
            let path =
                env::temp_dir().join(format!("rscoop-{}-{}-{}", name, process::id(), unique));
            fs::create_dir_all(&path).expect("create temp test directory");
            Self { path }
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn invokes_shim_from_resolved_root_when_present() {
        let temp = TempDir::new("shim-root");
        let root = temp.path.join("Scoop O'Root");
        let shims = root.join("shims");
        fs::create_dir_all(&shims).expect("create shims dir");
        fs::write(shims.join("scoop.ps1"), "").expect("write shim");

        let script = build_scoop_script(&root, ["update", "package's-name"]);

        assert_eq!(
            script,
            format!(
                "{} Import-Module Microsoft.PowerShell.Utility -EA SilentlyContinue; & '{}' 'update' 'package''s-name'",
                UTF8_OUTPUT_PREAMBLE,
                shims.join("scoop.ps1").display().to_string().replace('\'', "''")
            )
        );
    }

    #[test]
    fn falls_back_to_path_resolution_when_shim_missing() {
        let script = build_scoop_script(
            Path::new(r"C:\rscoop-test-nonexistent-root"),
            ["install", "7zip"],
        );

        assert_eq!(
            script,
            format!(
                "{} Import-Module Microsoft.PowerShell.Utility -EA SilentlyContinue; & scoop 'install' '7zip'",
                UTF8_OUTPUT_PREAMBLE
            )
        );
    }
}

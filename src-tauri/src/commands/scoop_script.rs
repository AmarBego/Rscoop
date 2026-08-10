use std::path::Path;

const UTF8_OUTPUT_PREAMBLE: &str =
    "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false);";

fn ps_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

pub(crate) fn build_scoop_script<I, S>(scoop_root: &Path, args: I) -> String
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let scoop_script = scoop_root.join("shims").join("scoop.ps1");
    let mut invocation = vec![ps_quote(&scoop_script.to_string_lossy())];
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
    use std::path::Path;

    #[test]
    fn invokes_scoop_from_resolved_root() {
        let script = build_scoop_script(
            Path::new(r"C:\Users\O'Brien\Scoop Root"),
            ["update", "package's-name"],
        );

        assert_eq!(
            script,
            format!(
                "{} Import-Module Microsoft.PowerShell.Utility -EA SilentlyContinue; & 'C:\\Users\\O''Brien\\Scoop Root\\shims\\scoop.ps1' 'update' 'package''s-name'",
                UTF8_OUTPUT_PREAMBLE
            )
        );
    }
}

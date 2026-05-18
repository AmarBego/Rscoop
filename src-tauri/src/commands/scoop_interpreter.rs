//! Scoop output classification.
//!
//! The mechanism — regex table, `$1` substitution, flat sequential phases,
//! multi-line notes collection, on-exit error fallback — lives in
//! [`execra::interpret`]. This module is now just the *data*: the Scoop rule
//! table, the phase-weight model, and the creep predicate.
//!
//! ## What gets classified
//!
//! The interpreter is intentionally **not** a full Scoop output catalogue.
//! A line earns a rule only if classifying it changes what the UI should
//! show, what status/progress should display, or what action the user
//! should take. Everything else stays raw transcript.
//!
//! The kept categories (see `status.md`):
//!
//! - **Benign** — `done.`, `ok.`, `The operation completed successfully.`
//!   These can land on stderr; we must not let them flip the bar to red.
//! - **Byte progress** — `12.34 MB / 50.00 MB` drives a real progress bar.
//! - **Phases** — downloading, verifying, extracting, installing,
//!   uninstalling, updating (+ Scoop self-update / buckets / cache).
//!   Granular sub-phases (`pre_install`, `installer`, `linking`, etc.)
//!   stay raw transcript.
//! - **Known errors** — failures the user must act on (hash mismatch,
//!   missing manifest, admin rights, Git missing, hash check, invalid URL,
//!   access denied, etc.).
//! - **Warnings** — partial-success conditions implying user action
//!   (already installed, held, cache ignored, no hash, SourceForge, etc.).
//! - **Summaries** — terminal success lines that replace the generic
//!   "X completed successfully" status.
//! - **Findings** — multi-line `Notes` block collected as `Finding::info`.
//!
//! ## Invariants (enforced by [`execra::interpret::RuleInterpreter`])
//!
//! - **Stream-agnostic.** Classify on text, never on stream. PowerShell
//!   happily routes status to stderr.
//! - **First-match wins.** Order in the table matters: benign/specific
//!   matches come before the generic `ERROR:` catch-all.
//! - **Interpreters don't decide success.** Exit code does. `KnownError`
//!   enriches a failure; `Summary` enriches a success.
//! - **No double-emit.** A rule `KnownError` suppresses the on-exit
//!   fallback so the same error never fires twice.

use execra::interpret::{FallbackPolicy, PhaseModel, Rule, RuleInterpreter};
use execra::{rules, Interpreter};

/// Approximate fraction range each phase occupies in the overall job
/// progress (0..=1). The bar fills monotonically as the pipeline moves
/// through these slices; byte progress within a phase lerps inside its
/// own range.
///
/// Numbers are rough estimates — Scoop doesn't expose phase timings, so
/// we pick weights that match the typical install (download dominates,
/// extract is shorter, link/shim/scripts are quick).
///
/// Phases not in this table contribute no fraction update; the bar
/// holds whatever value it had.
pub(crate) fn phase_range(name: &str) -> Option<(f32, f32)> {
    match name {
        // Top-level install / update: bar barely moves until download.
        "install" | "update" => Some((0.00, 0.05)),
        // Per-package install pipeline. Verify and extract each get
        // their own slice — both can take a while on big artifacts and
        // the creep ticker fills them so the bar isn't visibly stuck.
        "download" => Some((0.05, 0.25)),
        "verify" => Some((0.25, 0.30)),
        "extract" => Some((0.30, 0.50)),
        // Uninstall is one big block — no sub-phases worth weighting.
        "uninstall" => Some((0.00, 0.95)),
        // Scoop self-update: three sequential stages.
        "scoop_update" => Some((0.00, 0.20)),
        "buckets" => Some((0.20, 0.70)),
        "cache" => Some((0.70, 0.95)),
        _ => None,
    }
}

/// Phases that have no real determinate signal during their lifetime —
/// the bar would sit stuck if we didn't fake it. The creep ticker (wired
/// in `scoop.rs` via `TaskBuilder::creep`) bumps the fraction toward the
/// phase end while one of these is active.
pub(crate) fn is_creep_phase(name: &str) -> bool {
    matches!(
        name,
        "install"
            | "update"
            | "uninstall"
            | "verify"
            | "extract"
            | "scoop_update"
            | "buckets"
            | "cache"
    )
}

/// [`PhaseModel`] over [`phase_range`] — drives boundary progress and
/// byte-progress scaling inside [`RuleInterpreter`].
struct ScoopPhases;

impl PhaseModel for ScoopPhases {
    fn range(&self, name: &str) -> Option<(f32, f32)> {
        phase_range(name)
    }
}

// --- Rule table -------------------------------------------------------------
//
// Ordering rationale:
//   1. Benign noise — must short-circuit before any later rule.
//   2. Specific KnownErrors — beat the generic `ERROR:` catch-all.
//   3. Specific Warnings.
//   4. Phases (auto-exit each other; flat stack).
//   5. Byte progress.
//   6. Success summaries.
//   7. Generic `ERROR:` catch-all (must be last).
fn scoop_rules() -> Vec<Rule> {
    rules![
        // --- Benign PowerShell/Scoop status -----------------------------
        benign, r"^(?i)\s*the operation completed successfully\.?\s*$";
        benign, r"^(?i)\s*done\.?\s*$";
        // `ok.` is the hash-check OK indicator. PowerShell sometimes
        // routes it to stderr; without this rule it'd land in the
        // soft "failed" buffer or get colored as an error.
        benign, r"^(?i)\s*ok\.?\s*$";

        // --- Known errors ----------------------------------------------
        // Install/update pipeline.
        known, "scoop.hash_mismatch", "Downloaded file hash did not match manifest",
            r"(?i)Hash check failed";
        known, "scoop.unknown_package", "No manifest for '$1'",
            r"Couldn't find manifest for '([^']+)'";
        known, "scoop.no_manifest", "No manifest available for '$1'",
            r"No manifest available for '([^']+)'";
        known, "scoop.unsupported_arch", "'$1' doesn't support the current architecture",
            r"'([^']+)' doesn't support current architecture";
        known, "scoop.admin_required", "Administrator privileges are required for this operation",
            r"(?i)you need admin rights";
        known, "scoop.powershell_too_old", "PowerShell 5 or later is required to run Scoop",
            r"PowerShell 5 or later is required";
        known, "scoop.git_missing",
            "Scoop uses Git to update itself. Run `scoop install git` and try again.",
            r"Scoop uses Git to update itself";
        known, "scoop.update_failed", "Scoop update failed", r"^(?i)Update failed\.?$";
        known, "scoop.update_failed", "Scoop download failed", r"^(?i)Scoop download failed";
        known, "scoop.install_aborted",
            "Installation aborted. You might need to run `scoop uninstall` before trying again.",
            r"^Installation aborted";
        known, "scoop.folder_in_use", "Folder is in use; close any apps using Scoop and retry.",
            r"(?i)Folder in use";
        known, "scoop.access_denied", "Access denied: $1. You might need to restart.",
            r"^Access denied:\s+([^.]+)\.";
        // Download pipeline.
        known, "scoop.download.failed", "Download failed (error $1): $2",
            r"^Download failed!\s*\(Error\s*([^)]+)\)\s*(.*)$";
        known, "scoop.download.failed", "Download failed.", r"^Download failed!";
        known, "scoop.download.invalid_url", "URL $1 is not valid",
            r"^URL\s+(\S+)\s+is not valid";
        known, "scoop.download.cache_missing", "Cached file not found.",
            r"^(?i)cached file not found";
        known, "scoop.download.no_hash_in_manifest", "Couldn't find hash in manifest for '$1'.",
            r"^Couldn't find hash in manifest for '([^']+)'";
        known, "scoop.download.unsupported_hash", "Hash type '$1' isn't supported.",
            r"^Hash type '([^']+)' isn't supported";

        // --- Warnings (partial success / user action implied) ----------
        warning, "scoop.update.running_process",
            "Scoop skipped one or more updates because related processes are still running. Close the listed processes and run the update again.",
            r"(?i)running process detected.*skip\s+updating";
        warning, "scoop.update.held", "'$1' is held to a fixed version and was not updated.",
            r"'([^']+)' is held to version";
        warning, "scoop.install.already_installed", "'$1' is already installed.",
            r"^(?:WARN\s+)?'([^']+)'.*is already installed\b";
        warning, "scoop.outdated",
            "Scoop itself is out of date. Run `scoop update` to refresh.",
            r"^(?i)Scoop is out of date\.";
        warning, "scoop.install.added_to_path", "Installer added a path to system PATH.",
            r"^Installer added '.*' to system path";
        warning, "scoop.update.sourceforge",
            "SourceForge.net is known for causing hash validation failures.",
            r"SourceForge\.net is known for causing";
        warning, "scoop.download.cache_ignored", "Cache is being ignored — fetching fresh.",
            r"^Cache is being ignored";
        warning, "scoop.download.token_misconfigured", "Token might be misconfigured.",
            r"^Token might be misconfigured";
        warning, "scoop.download.no_hash_in_manifest",
            "Manifest has no hash for '$1'. SHA256 was computed but not verified.",
            r"^Warning: No hash in manifest\. SHA256 for '([^']+)' is";
        warning, "scoop.download.hash_skipped", "Hash verification skipped.",
            r"^Skipping hash verification";

        // --- Phases (top-level pipeline; auto-exit each other) ---------
        // Top-level intent — populates the modal subtitle immediately,
        // before download/extract phases swap in.
        enter_phase, "install",   "Installing $1",   r"^Installing '([^']+)'";
        enter_phase, "uninstall", "Uninstalling $1", r"^Uninstalling '([^']+)'";
        enter_phase, "update",    "Updating $1",     r"^Updating '([^']+)'";
        // Scoop self-update sub-stages.
        enter_phase, "scoop_update", "Updating Scoop",   r"^Updating Scoop\.\.\.";
        enter_phase, "buckets",      "Updating buckets", r"^Updating Buckets\.\.\.";
        enter_phase, "cache",        "Updating cache",   r"^Updating cache\.\.\.";
        // Per-package install pipeline (broad strokes only).
        enter_phase, "download", "Downloading $1", r"^(?i)Downloading '([^']+)'";
        enter_phase, "download", "Downloading",   r"^(?i)Downloading\b";
        // "Checking hash" is its own phase — the creep ticker fills its
        // slice so hashing a multi-GB nupkg looks like progress, not a
        // stuck bar.
        enter_phase, "verify",   "Verifying download", r"^(?i)Checking hash";
        enter_phase, "extract",  "Extracting $1", r"^(?i)Extracting (.+?)\.{2,}";
        enter_phase, "extract",  "Extracting",    r"^(?i)Extracting\b";

        // --- Byte progress (drives the real status-bar fill) -----------
        byte_progress_mb, r"([\d.]+)\s*MB\s*/\s*([\d.]+)\s*MB";

        // --- Progress (single-line transient signals) ------------------
        // "Removing <path>..." for cache rm / cleanup of old versions.
        progress, "removing_cache", r"^Removing\s+\S+\.\.\.$";

        // --- Success summaries -----------------------------------------
        summary, "Installed $1 $2",
            r"'([^']+)'\s+\(([^)]+)\)\s+was installed successfully";
        summary, "Uninstalled $1", r"'([^']+)'\s+was uninstalled";
        summary, "Downloaded $1 $2",
            r"'([^']+)'\s+\(([^)]+)\)\s+was downloaded successfully";
        summary, "Scoop was updated successfully", r"^Scoop was updated successfully";
        summary, "All apps are up to date", r"^Latest versions for all apps are installed";
        summary, "Everything is clean",       r"^Everything is shiny now";
        summary, "Scoop has been uninstalled", r"^Scoop has been uninstalled";

        // --- Generic ERROR: catch-all (MUST be last) -------------------
        known, "scoop.command_error", "$1", r"^(?i)ERROR:\s*(.+)$";
    ]
}

/// The Scoop interpreter: the rule table above, the [`ScoopPhases`] weight
/// model, multi-line `Notes` collection, and an on-exit error fallback.
pub fn scoop_interpreter() -> impl Interpreter {
    RuleInterpreter::new(scoop_rules(), ScoopPhases)
        .notes("Notes", "scoop.notes")
        .fallback(FallbackPolicy::default().code("scoop.command_error"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use execra::{Context, ExitCode, InterpreterEvent, Line};

    /// Drive the real Scoop interpreter through a sequence of (stream, line)
    /// pairs plus an exit code, collecting every event it emits. This is an
    /// integration check over the actual rule table + phase weights; the
    /// generic engine contract is covered in `execra::interpret`.
    fn drive(lines: &[(execra::Stream, &str)], exit: ExitCode) -> Vec<InterpreterEvent> {
        let mut interp = scoop_interpreter();
        let mut out = Vec::new();
        let now = std::time::SystemTime::now();
        let cmd = execra::Command::new("dummy");
        let spec = cmd.spec();
        let ctx = Context {
            job: execra::JobId::new(),
            command: spec,
            current_phase: None,
            phase_stack: &[],
            elapsed: std::time::Duration::ZERO,
        };
        for (stream, text) in lines {
            out.extend(interp.on_line(
                &ctx,
                &Line {
                    stream: *stream,
                    text: (*text).to_string(),
                    at: now,
                },
            ));
        }
        out.extend(interp.on_exit(&ctx, &exit));
        out
    }

    fn classify(lines: &[&str]) -> Vec<InterpreterEvent> {
        let pairs: Vec<_> = lines.iter().map(|l| (execra::Stream::Stdout, *l)).collect();
        drive(&pairs, ExitCode::from_code(0))
    }

    #[test]
    fn benign_status_emits_nothing() {
        assert!(classify(&["The operation completed successfully."]).is_empty());
        assert!(classify(&["done."]).is_empty());
        assert!(classify(&["ok."]).is_empty());
        assert!(classify(&["  ok  "]).is_empty());
    }

    #[test]
    fn byte_progress_emits_determinate() {
        // No active phase → raw ratio. 12.34 / 50.00 = 0.2468.
        let evs = classify(&["12.34 MB / 50.00 MB"]);
        let p = evs
            .iter()
            .find_map(|e| match e {
                InterpreterEvent::Progress { progress } => progress.as_fraction(),
                _ => None,
            })
            .expect(&format!("expected a Progress event, got {evs:?}"));
        assert!((p - 0.2468).abs() < 0.01, "expected ~0.2468, got {p}");
    }

    #[test]
    fn hash_failure_is_known_error() {
        let evs = classify(&["Hash check failed for download.zip"]);
        assert!(matches!(evs.as_slice(), [InterpreterEvent::KnownError { code, .. }] if code == "scoop.hash_mismatch"));
    }

    #[test]
    fn download_failed_is_known_error() {
        let evs = classify(&["Download failed! (Error 6) couldn't resolve host"]);
        assert!(
            matches!(evs.as_slice(), [InterpreterEvent::KnownError { code, message }]
                if code == "scoop.download.failed"
                && message.contains("error 6") && message.contains("couldn't resolve")),
            "got {evs:?}"
        );
    }

    #[test]
    fn running_process_warns() {
        let evs = classify(&["WARN  Running process detected, skip updating."]);
        assert!(matches!(evs.as_slice(), [InterpreterEvent::Warning { code: Some(c), .. }] if c == "scoop.update.running_process"));
    }

    #[test]
    fn cache_ignored_warns() {
        let evs = classify(&["Cache is being ignored."]);
        assert!(
            matches!(evs.as_slice(), [InterpreterEvent::Warning { code: Some(c), .. }] if c == "scoop.download.cache_ignored"),
            "got {evs:?}"
        );
    }

    #[test]
    fn already_installed_classifies_as_warning_not_summary() {
        for line in [
            "'firefox' (1.2.3) is already installed.",
            "WARN 'firefox' (1.2.3) is already installed.",
        ] {
            let evs = classify(&[line]);
            assert!(
                matches!(
                    evs.as_slice(),
                    [InterpreterEvent::Warning { code: Some(c), .. }]
                        if c == "scoop.install.already_installed"
                ),
                "expected warning for {line:?}, got {evs:?}"
            );
        }
    }

    #[test]
    fn install_summary() {
        let evs = classify(&["'firefox' (1.2.3) was installed successfully!"]);
        assert!(
            matches!(evs.as_slice(), [InterpreterEvent::Summary { text }] if text == "Installed firefox 1.2.3")
        );
    }

    #[test]
    fn downloaded_successfully_summary() {
        let evs = classify(&["'firefox' (1.2.3) was downloaded successfully!"]);
        assert!(
            matches!(evs.as_slice(), [InterpreterEvent::Summary { text }] if text == "Downloaded firefox 1.2.3"),
            "got {evs:?}"
        );
    }

    #[test]
    fn verify_is_its_own_phase_after_download() {
        // "Checking hash" exits download and enters the verify phase.
        let evs = drive(
            &[
                (execra::Stream::Stdout, "Downloading 'gitkraken.nupkg'"),
                (execra::Stream::Stdout, "Checking hash of gitkraken.nupkg"),
            ],
            ExitCode::from_code(0),
        );
        let phase_names: Vec<&str> = evs
            .iter()
            .filter_map(|e| match e {
                InterpreterEvent::EnterPhase { name, .. } => Some(name.as_str()),
                _ => None,
            })
            .collect();
        assert_eq!(phase_names, vec!["download", "verify"], "got {evs:?}");
    }

    #[test]
    fn full_install_pipeline_fills_monotonically() {
        let evs = drive(
            &[
                (execra::Stream::Stdout, "Installing 'firefox'"),
                (execra::Stream::Stdout, "Downloading 'firefox.zip'"),
                (execra::Stream::Stdout, "25.0 MB / 50.0 MB"),
                (execra::Stream::Stdout, "Extracting firefox.zip ..."),
            ],
            ExitCode::from_code(0),
        );
        let fractions: Vec<f32> = evs
            .iter()
            .filter_map(|e| match e {
                InterpreterEvent::Progress { progress } => progress.as_fraction(),
                _ => None,
            })
            .collect();
        for w in fractions.windows(2) {
            assert!(
                w[1] + 0.0001 >= w[0],
                "non-monotonic progress {:?} in {fractions:?}",
                w
            );
        }
        // Final fraction (from on_exit closing extract) = extract's end.
        assert!(
            (fractions.last().copied().unwrap_or(0.0) - 0.50).abs() < 0.001,
            "expected final 0.50, got {fractions:?}"
        );
    }

    #[test]
    fn notes_block_collects_into_finding() {
        let evs = drive(
            &[
                (
                    execra::Stream::Stdout,
                    "'7zip' (24.09) was installed successfully!",
                ),
                (execra::Stream::Stdout, "Notes"),
                (execra::Stream::Stdout, "-----"),
                (execra::Stream::Stdout, "Add the install dir to PATH"),
                (execra::Stream::Stdout, "Also: don't forget to restart shells"),
                (execra::Stream::Stdout, ""),
            ],
            ExitCode::from_code(0),
        );
        let f = evs
            .iter()
            .find_map(|e| match e {
                InterpreterEvent::Finding { finding } if finding.code == "scoop.notes" => {
                    Some(finding)
                }
                _ => None,
            })
            .expect(&format!("expected a scoop.notes Finding, got {evs:?}"));
        assert!(f.message.contains("Add the install dir to PATH"));
        assert!(f.message.contains("don't forget to restart shells"));
    }

    #[test]
    fn classified_error_is_not_re_emitted_on_exit() {
        let evs = drive(
            &[(execra::Stream::Stderr, "ERROR: something broke")],
            ExitCode::from_code(1),
        );
        assert_eq!(
            evs.iter()
                .filter(|e| matches!(e, InterpreterEvent::KnownError { .. }))
                .count(),
            1,
            "expected exactly one KnownError, got {evs:?}"
        );
    }

    #[test]
    fn stderr_fallback_used_when_nothing_classified() {
        let evs = drive(
            &[
                (execra::Stream::Stdout, "doing stuff"),
                (execra::Stream::Stderr, "weird unstructured diagnostic"),
            ],
            ExitCode::from_code(7),
        );
        assert!(
            matches!(
                evs.last(),
                Some(InterpreterEvent::KnownError { code, message })
                    if code == "scoop.command_error"
                    && message.contains("weird unstructured diagnostic")
            ),
            "expected stderr fallback, got {evs:?}"
        );
    }
}

//! Execra interpreter for the `scoop` CLI.
//!
//! Output lines from Scoop are matched against a declarative rule table
//! (see [`RULES`]) and translated into typed [`InterpreterEvent`]s. The
//! `rule!` macro hides regex compilation and closure boilerplate.
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
//! ## Invariants
//!
//! - **Stream-agnostic.** Classify on `Line.text`, never `Line.stream`.
//!   PowerShell happily routes status to stderr.
//! - **First-match wins.** Order in [`RULES`] matters: benign/specific
//!   matches come before the generic `ERROR:` catch-all.
//! - **Interpreters don't decide success.** Exit code does. `KnownError`
//!   enriches a failure; `Summary` enriches a success.
//! - **No double-emit.** A `KnownError` from a rule suppresses the
//!   on-exit fallback so the same error never fires twice.

use execra::{Context, ExitCode, Finding, Interpreter, InterpreterEvent, Line, Progress};
use once_cell::sync::Lazy;
use regex::{Captures, Regex};

/// A line classification rule. Built via the local [`rule!`] macro.
struct Rule {
    regex: Regex,
    action: RuleAction,
}

/// What to emit when a rule matches. Template strings support `$1`, `$2`,
/// etc. for regex capture substitution.
enum RuleAction {
    /// Matched and intentionally silent.
    Benign,
    /// Indeterminate progress signal with a static hint label.
    Progress(&'static str),
    /// Enter a phase. If a phase is already active, the interpreter
    /// auto-emits an `ExitPhase` first — Scoop's pipeline is sequential.
    EnterPhase {
        name: &'static str,
        label_template: &'static str,
    },
    /// Non-fatal warning. Surfaces as `OperationWarning` on the active op.
    Warning {
        code: &'static str,
        template: &'static str,
    },
    /// Classified error. Emitted once; suppresses the on-exit fallback.
    KnownError {
        code: &'static str,
        template: &'static str,
    },
    /// Summary line — used in place of the generic
    /// "X completed successfully" status.
    Summary { template: &'static str },
    /// Determinate byte progress. The regex MUST capture `$1 = done_mb`,
    /// `$2 = total_mb` as decimal numbers. Unparseable captures degrade
    /// silently to no event.
    ByteProgressMb,
}

impl Rule {
    fn new(pattern: &str, action: RuleAction) -> Self {
        Self {
            regex: Regex::new(pattern)
                .unwrap_or_else(|e| panic!("invalid scoop interpreter regex {pattern:?}: {e}")),
            action,
        }
    }
}

/// Build a [`Rule`] declaratively. Local to this module so the rule types
/// stay private.
///
/// Shape:
///
/// ```ignore
/// rule!(benign,           r"…");
/// rule!(progress,         "label",           r"…");
/// rule!(enter_phase,      "name", "label",   r"…");
/// rule!(warning,          "code", "message", r"…");
/// rule!(known,            "code", "message", r"…");
/// rule!(summary,          "message",         r"…");
/// rule!(byte_progress_mb,                    r"…");
/// ```
///
/// Message and label templates may interpolate regex captures with
/// `$1`, `$2`, … etc.
macro_rules! rule {
    (benign, $pat:expr) => {
        Rule::new($pat, RuleAction::Benign)
    };
    (progress, $label:expr, $pat:expr) => {
        Rule::new($pat, RuleAction::Progress($label))
    };
    (enter_phase, $name:expr, $label:expr, $pat:expr) => {
        Rule::new(
            $pat,
            RuleAction::EnterPhase {
                name: $name,
                label_template: $label,
            },
        )
    };
    (warning, $code:expr, $msg:expr, $pat:expr) => {
        Rule::new(
            $pat,
            RuleAction::Warning {
                code: $code,
                template: $msg,
            },
        )
    };
    (known, $code:expr, $msg:expr, $pat:expr) => {
        Rule::new(
            $pat,
            RuleAction::KnownError {
                code: $code,
                template: $msg,
            },
        )
    };
    (summary, $msg:expr, $pat:expr) => {
        Rule::new($pat, RuleAction::Summary { template: $msg })
    };
    (byte_progress_mb, $pat:expr) => {
        Rule::new($pat, RuleAction::ByteProgressMb)
    };
}

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
/// the bar would sit stuck if we didn't fake it. A creep ticker bumps
/// the fraction toward the phase end while one of these is active.
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

/// Substitute `$1`, `$2`, … in `template` with regex captures. Missing
/// captures collapse to empty; literal `$` followed by a non-digit is
/// preserved.
fn render(template: &str, caps: &Captures) -> String {
    let mut out = String::with_capacity(template.len());
    let mut chars = template.chars().peekable();
    while let Some(c) = chars.next() {
        if c != '$' {
            out.push(c);
            continue;
        }
        let mut digits = String::new();
        while let Some(&d) = chars.peek() {
            if d.is_ascii_digit() {
                digits.push(d);
                chars.next();
            } else {
                break;
            }
        }
        if digits.is_empty() {
            out.push('$');
            continue;
        }
        if let Ok(idx) = digits.parse::<usize>() {
            if let Some(m) = caps.get(idx) {
                out.push_str(m.as_str());
            }
        }
    }
    out
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

static RULES: Lazy<Vec<Rule>> = Lazy::new(|| {
    vec![
        // --- Benign PowerShell/Scoop status -----------------------------
        rule!(benign, r"^(?i)\s*the operation completed successfully\.?\s*$"),
        rule!(benign, r"^(?i)\s*done\.?\s*$"),
        // `ok.` is the hash-check OK indicator. PowerShell sometimes
        // routes it to stderr; without this rule it'd land in the
        // soft "failed" buffer or get colored as an error.
        rule!(benign, r"^(?i)\s*ok\.?\s*$"),

        // --- Known errors ----------------------------------------------
        // Install/update pipeline.
        rule!(
            known,
            "scoop.hash_mismatch",
            "Downloaded file hash did not match manifest",
            r"(?i)Hash check failed"
        ),
        rule!(
            known,
            "scoop.unknown_package",
            "No manifest for '$1'",
            r"Couldn't find manifest for '([^']+)'"
        ),
        rule!(
            known,
            "scoop.no_manifest",
            "No manifest available for '$1'",
            r"No manifest available for '([^']+)'"
        ),
        rule!(
            known,
            "scoop.unsupported_arch",
            "'$1' doesn't support the current architecture",
            r"'([^']+)' doesn't support current architecture"
        ),
        rule!(
            known,
            "scoop.admin_required",
            "Administrator privileges are required for this operation",
            r"(?i)you need admin rights"
        ),
        rule!(
            known,
            "scoop.powershell_too_old",
            "PowerShell 5 or later is required to run Scoop",
            r"PowerShell 5 or later is required"
        ),
        rule!(
            known,
            "scoop.git_missing",
            "Scoop uses Git to update itself. Run `scoop install git` and try again.",
            r"Scoop uses Git to update itself"
        ),
        rule!(
            known,
            "scoop.update_failed",
            "Scoop update failed",
            r"^(?i)Update failed\.?$"
        ),
        rule!(
            known,
            "scoop.update_failed",
            "Scoop download failed",
            r"^(?i)Scoop download failed"
        ),
        rule!(
            known,
            "scoop.install_aborted",
            "Installation aborted. You might need to run `scoop uninstall` before trying again.",
            r"^Installation aborted"
        ),
        rule!(
            known,
            "scoop.folder_in_use",
            "Folder is in use; close any apps using Scoop and retry.",
            r"(?i)Folder in use"
        ),
        rule!(
            known,
            "scoop.access_denied",
            "Access denied: $1. You might need to restart.",
            r"^Access denied:\s+([^.]+)\."
        ),
        // Download pipeline.
        rule!(
            known,
            "scoop.download.failed",
            "Download failed (error $1): $2",
            r"^Download failed!\s*\(Error\s*([^)]+)\)\s*(.*)$"
        ),
        rule!(
            known,
            "scoop.download.failed",
            "Download failed.",
            r"^Download failed!"
        ),
        rule!(
            known,
            "scoop.download.invalid_url",
            "URL $1 is not valid",
            r"^URL\s+(\S+)\s+is not valid"
        ),
        rule!(
            known,
            "scoop.download.cache_missing",
            "Cached file not found.",
            r"^(?i)cached file not found"
        ),
        rule!(
            known,
            "scoop.download.no_hash_in_manifest",
            "Couldn't find hash in manifest for '$1'.",
            r"^Couldn't find hash in manifest for '([^']+)'"
        ),
        rule!(
            known,
            "scoop.download.unsupported_hash",
            "Hash type '$1' isn't supported.",
            r"^Hash type '([^']+)' isn't supported"
        ),

        // --- Warnings (partial success / user action implied) ----------
        rule!(
            warning,
            "scoop.update.running_process",
            "Scoop skipped one or more updates because related processes are still running. Close the listed processes and run the update again.",
            r"(?i)running process detected.*skip\s+updating"
        ),
        rule!(
            warning,
            "scoop.update.held",
            "'$1' is held to a fixed version and was not updated.",
            r"'([^']+)' is held to version"
        ),
        rule!(
            warning,
            "scoop.install.already_installed",
            "'$1' is already installed.",
            r"^(?:WARN\s+)?'([^']+)'.*is already installed\b"
        ),
        rule!(
            warning,
            "scoop.outdated",
            "Scoop itself is out of date. Run `scoop update` to refresh.",
            r"^(?i)Scoop is out of date\."
        ),
        rule!(
            warning,
            "scoop.install.added_to_path",
            "Installer added a path to system PATH.",
            r"^Installer added '.*' to system path"
        ),
        rule!(
            warning,
            "scoop.update.sourceforge",
            "SourceForge.net is known for causing hash validation failures.",
            r"SourceForge\.net is known for causing"
        ),
        rule!(
            warning,
            "scoop.download.cache_ignored",
            "Cache is being ignored — fetching fresh.",
            r"^Cache is being ignored"
        ),
        rule!(
            warning,
            "scoop.download.token_misconfigured",
            "Token might be misconfigured.",
            r"^Token might be misconfigured"
        ),
        rule!(
            warning,
            "scoop.download.no_hash_in_manifest",
            "Manifest has no hash for '$1'. SHA256 was computed but not verified.",
            r"^Warning: No hash in manifest\. SHA256 for '([^']+)' is"
        ),
        rule!(
            warning,
            "scoop.download.hash_skipped",
            "Hash verification skipped.",
            r"^Skipping hash verification"
        ),

        // --- Phases (top-level pipeline; auto-exit each other) ---------
        // Top-level intent — populates the modal subtitle immediately,
        // before download/extract phases swap in.
        rule!(enter_phase, "install",   "Installing $1",   r"^Installing '([^']+)'"),
        rule!(enter_phase, "uninstall", "Uninstalling $1", r"^Uninstalling '([^']+)'"),
        rule!(enter_phase, "update",    "Updating $1",     r"^Updating '([^']+)'"),
        // Scoop self-update sub-stages.
        rule!(enter_phase, "scoop_update", "Updating Scoop",   r"^Updating Scoop\.\.\."),
        rule!(enter_phase, "buckets",      "Updating buckets", r"^Updating Buckets\.\.\."),
        rule!(enter_phase, "cache",        "Updating cache",   r"^Updating cache\.\.\."),
        // Per-package install pipeline (broad strokes only).
        rule!(enter_phase, "download", "Downloading $1", r"^(?i)Downloading '([^']+)'"),
        rule!(enter_phase, "download", "Downloading",   r"^(?i)Downloading\b"),
        // "Checking hash" is its own phase — the creep ticker fills its
        // slice so hashing a multi-GB nupkg looks like progress, not a
        // stuck bar.
        rule!(enter_phase, "verify",   "Verifying download", r"^(?i)Checking hash"),
        rule!(enter_phase, "extract",  "Extracting $1", r"^(?i)Extracting (.+?)\.{2,}"),
        rule!(enter_phase, "extract",  "Extracting",    r"^(?i)Extracting\b"),

        // --- Byte progress (drives the real status-bar fill) -----------
        rule!(byte_progress_mb, r"([\d.]+)\s*MB\s*/\s*([\d.]+)\s*MB"),

        // --- Progress (single-line transient signals) ------------------
        // "Removing <path>..." for cache rm / cleanup of old versions.
        rule!(progress, "removing_cache", r"^Removing\s+\S+\.\.\.$"),

        // --- Success summaries -----------------------------------------
        rule!(
            summary,
            "Installed $1 $2",
            r"'([^']+)'\s+\(([^)]+)\)\s+was installed successfully"
        ),
        rule!(
            summary,
            "Uninstalled $1",
            r"'([^']+)'\s+was uninstalled"
        ),
        rule!(
            summary,
            "Downloaded $1 $2",
            r"'([^']+)'\s+\(([^)]+)\)\s+was downloaded successfully"
        ),
        rule!(
            summary,
            "Scoop was updated successfully",
            r"^Scoop was updated successfully"
        ),
        rule!(
            summary,
            "All apps are up to date",
            r"^Latest versions for all apps are installed"
        ),
        rule!(summary, "Everything is clean",       r"^Everything is shiny now"),
        rule!(summary, "Scoop has been uninstalled", r"^Scoop has been uninstalled"),

        // --- Generic ERROR: catch-all (MUST be last) -------------------
        rule!(
            known,
            "scoop.command_error",
            "$1",
            r"^(?i)ERROR:\s*(.+)$"
        ),
    ]
});

// --- Interpreter ------------------------------------------------------------

#[derive(Default)]
pub struct ScoopInterpreter {
    /// Set once any rule has emitted a `KnownError`. Suppresses the
    /// on-exit fallback so we never double-emit the same error.
    emitted_known_error: bool,
    /// Best-effort error text buffered for the on-exit fallback when no
    /// rule classified the failure. Populated by "failed"-looking lines.
    fallback_error: Option<String>,
    /// Last non-empty stderr line. Last-resort fallback when exit is
    /// non-zero and nothing else was captured.
    last_stderr: Option<String>,
    /// True while collecting a "Notes" block. Terminates on a blank line.
    in_notes: bool,
    notes_buf: Vec<String>,
    /// Name of the currently-open phase, if any. Tracked locally so each
    /// `EnterPhase` rule can auto-emit `ExitPhase` first and keep the
    /// runtime phase stack flat.
    current_phase: Option<&'static str>,
}

impl ScoopInterpreter {
    /// Drain the current notes buffer into a `Finding::info`. Returns an
    /// empty Vec when nothing was buffered.
    fn flush_notes(&mut self) -> Vec<InterpreterEvent> {
        self.in_notes = false;
        if self.notes_buf.is_empty() {
            return vec![];
        }
        let text = std::mem::take(&mut self.notes_buf).join("\n");
        vec![InterpreterEvent::Finding {
            finding: Finding::info("scoop.notes", text),
        }]
    }
}

impl Interpreter for ScoopInterpreter {
    fn on_line(&mut self, _ctx: &Context, line: &Line) -> Vec<InterpreterEvent> {
        let text = &line.text;

        // --- Notes block (multi-line; terminates on blank line) -------
        if self.in_notes {
            // Skip the `-----` separator immediately under "Notes".
            if text.trim_start().starts_with("---") {
                return vec![];
            }
            if text.trim().is_empty() {
                return self.flush_notes();
            }
            self.notes_buf.push(text.clone());
            return vec![];
        }
        if text.trim() == "Notes" {
            self.in_notes = true;
            return vec![];
        }

        if text.is_empty() {
            return vec![];
        }

        if line.stream == execra::Stream::Stderr {
            self.last_stderr = Some(text.clone());
        }

        for rule in RULES.iter() {
            let Some(caps) = rule.regex.captures(text) else {
                continue;
            };
            return match &rule.action {
                RuleAction::Benign => vec![],
                RuleAction::Progress(label) => vec![InterpreterEvent::Progress {
                    progress: Progress::indeterminate(*label),
                }],
                RuleAction::EnterPhase {
                    name,
                    label_template,
                } => {
                    let label = render(label_template, &caps);
                    // Emit boundary Progress events around the
                    // ExitPhase/EnterPhase pair so the bar advances
                    // continuously through the pipeline instead of
                    // resetting per phase.
                    let mut events = Vec::with_capacity(4);
                    if let Some(prev) = self.current_phase {
                        events.push(InterpreterEvent::ExitPhase);
                        if let Some((_, end)) = phase_range(prev) {
                            events.push(InterpreterEvent::Progress {
                                progress: Progress::fraction(end),
                            });
                        }
                    }
                    self.current_phase = Some(*name);
                    events.push(InterpreterEvent::EnterPhase {
                        name: (*name).to_string(),
                        label: Some(label),
                    });
                    if let Some((start, _)) = phase_range(*name) {
                        events.push(InterpreterEvent::Progress {
                            progress: Progress::fraction(start),
                        });
                    }
                    events
                }
                RuleAction::Warning { code, template } => {
                    vec![InterpreterEvent::Warning {
                        code: Some((*code).to_string()),
                        message: render(template, &caps),
                    }]
                }
                RuleAction::KnownError { code, template } => {
                    let message = render(template, &caps);
                    self.emitted_known_error = true;
                    self.fallback_error = None;
                    vec![InterpreterEvent::KnownError {
                        code: (*code).to_string(),
                        message,
                    }]
                }
                RuleAction::Summary { template } => vec![InterpreterEvent::Summary {
                    text: render(template, &caps),
                }],
                RuleAction::ByteProgressMb => {
                    let done = caps.get(1).and_then(|m| m.as_str().parse::<f64>().ok());
                    let total = caps.get(2).and_then(|m| m.as_str().parse::<f64>().ok());
                    match (done, total) {
                        (Some(d), Some(t)) if t > 0.0 => {
                            // Scale byte ratio into the active phase's
                            // fraction slice so the bar fills the
                            // "download" portion of the whole pipeline,
                            // not the whole bar. Outside a known phase
                            // we emit the raw ratio.
                            let ratio = (d / t).clamp(0.0, 1.0) as f32;
                            let fraction = self
                                .current_phase
                                .and_then(phase_range)
                                .map(|(start, end)| start + ratio * (end - start))
                                .unwrap_or(ratio);
                            vec![InterpreterEvent::Progress {
                                progress: Progress::fraction(fraction),
                            }]
                        }
                        _ => vec![],
                    }
                }
            };
        }

        // Unclassified — soft-buffer "failed"-looking text for the
        // on-exit fallback. First mention wins.
        if self.fallback_error.is_none() {
            let lower = text.to_ascii_lowercase();
            if lower.contains("failed") {
                self.fallback_error = Some(text.clone());
            }
        }

        vec![]
    }

    fn on_exit(&mut self, _ctx: &Context, exit: &ExitCode) -> Vec<InterpreterEvent> {
        // Flush any in-progress Notes block — process may have ended mid-block.
        let mut events = self.flush_notes();

        // Close any dangling phase so the runtime stack is empty, and
        // advance the bar to that phase's end so the final visual reads
        // as "complete" rather than wherever byte progress paused.
        if let Some(prev) = self.current_phase.take() {
            events.push(InterpreterEvent::ExitPhase);
            if let Some((_, end)) = phase_range(prev) {
                events.push(InterpreterEvent::Progress {
                    progress: Progress::fraction(end),
                });
            }
        }

        if exit.is_success() || self.emitted_known_error {
            return events;
        }
        // Prefer the first buffered "failed" line; fall back to the last
        // stderr line; otherwise let the runtime surface a generic
        // NonZeroExit.
        let message = self
            .fallback_error
            .take()
            .or_else(|| self.last_stderr.take());
        if let Some(message) = message {
            events.push(InterpreterEvent::KnownError {
                code: "scoop.command_error".into(),
                message,
            });
        }
        events
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Drive an interpreter through a sequence of (stream, line) pairs
    /// plus an exit code, collecting every event it emits.
    fn drive(
        lines: &[(execra::Stream, &str)],
        exit: ExitCode,
    ) -> (Vec<InterpreterEvent>, ScoopInterpreter) {
        let mut interp = ScoopInterpreter::default();
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
        (out, interp)
    }

    /// Stdout-only shorthand for single-line classification assertions.
    fn classify(lines: &[&str]) -> Vec<InterpreterEvent> {
        let pairs: Vec<_> = lines.iter().map(|l| (execra::Stream::Stdout, *l)).collect();
        drive(&pairs, ExitCode::from_code(0)).0
    }

    // --- Benign ---------------------------------------------------------

    #[test]
    fn benign_status_emits_nothing() {
        assert!(classify(&["The operation completed successfully."]).is_empty());
        assert!(classify(&["done."]).is_empty());
        assert!(classify(&["ok."]).is_empty());
        assert!(classify(&["  ok  "]).is_empty());
    }

    // --- Byte progress --------------------------------------------------

    #[test]
    fn byte_progress_emits_determinate() {
        let evs = classify(&["12.34 MB / 50.00 MB"]);
        let progress = evs.iter().find_map(|e| match e {
            InterpreterEvent::Progress { progress } => Some(progress),
            _ => None,
        });
        let p = progress.expect(&format!("expected a Progress event, got {evs:?}"));
        let fraction = p.as_fraction().expect("expected determinate progress");
        assert!(
            (fraction - 0.2468).abs() < 0.01,
            "expected ~0.2468, got {fraction}"
        );
    }

    // --- Known errors ---------------------------------------------------

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

    // --- Warnings -------------------------------------------------------

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
    fn scoop_out_of_date_warns() {
        let evs = classify(&["Scoop is out of date."]);
        assert!(
            matches!(evs.as_slice(), [InterpreterEvent::Warning { code: Some(c), .. }] if c == "scoop.outdated"),
            "got {evs:?}"
        );
    }

    #[test]
    fn already_installed_classifies_as_warning_not_summary() {
        let evs = classify(&["'firefox' (1.2.3) is already installed."]);
        assert!(
            matches!(
                evs.as_slice(),
                [InterpreterEvent::Warning { code: Some(c), .. }]
                    if c == "scoop.install.already_installed"
            ),
            "expected warning, got {evs:?}"
        );

        // Verify that Scoop's WARN prefix is handled too.
        let evs = classify(&["WARN 'firefox' (1.2.3) is already installed."]);
        assert!(
            matches!(
                evs.as_slice(),
                [InterpreterEvent::Warning { code: Some(c), .. }]
                    if c == "scoop.install.already_installed"
            ),
            "expected warning for WARN-prefixed line, got {evs:?}"
        );
    }

    // --- Summaries ------------------------------------------------------

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

    // --- Phases ---------------------------------------------------------

    #[test]
    fn phase_sequence_auto_exits_previous() {
        // Two sequential phases. The second EnterPhase should auto-emit
        // ExitPhase first so the runtime's phase stack stays flat.
        // Filter Progress events; we only care about phase event order.
        let (evs, _) = drive(
            &[
                (execra::Stream::Stdout, "Downloading 'firefox-1.2.3.zip'"),
                (execra::Stream::Stdout, "Extracting firefox-1.2.3.zip ..."),
            ],
            ExitCode::from_code(0),
        );
        let kinds: Vec<&str> = evs
            .iter()
            .filter_map(|e| match e {
                InterpreterEvent::EnterPhase { .. } => Some("enter"),
                InterpreterEvent::ExitPhase => Some("exit"),
                _ => None,
            })
            .collect();
        assert_eq!(
            kinds,
            vec!["enter", "exit", "enter", "exit"],
            "got events {evs:?}"
        );
    }

    #[test]
    fn phase_entry_emits_start_fraction() {
        let evs = classify(&["Downloading 'firefox.zip'"]);
        let fractions: Vec<f32> = evs
            .iter()
            .filter_map(|e| match e {
                InterpreterEvent::Progress { progress } => progress.as_fraction(),
                _ => None,
            })
            .collect();
        // download phase starts at 0.05; on_exit closes it at 0.25
        // (download's end per `phase_range`).
        assert_eq!(
            fractions,
            vec![0.05, 0.25],
            "expected start+end fractions, got {evs:?}"
        );
    }

    #[test]
    fn byte_progress_scales_into_active_phase() {
        // 12.34 / 50.00 = 0.2468 raw; download slice is [0.05, 0.25]
        // (width 0.20) so scaled ≈ 0.05 + 0.2468 * 0.20 ≈ 0.099.
        let (evs, _) = drive(
            &[
                (execra::Stream::Stdout, "Downloading 'firefox.zip'"),
                (execra::Stream::Stdout, "12.34 MB / 50.00 MB"),
            ],
            ExitCode::from_code(0),
        );
        let determinate: Vec<f32> = evs
            .iter()
            .filter_map(|e| match e {
                InterpreterEvent::Progress { progress } => progress.as_fraction(),
                _ => None,
            })
            .collect();
        // [start=0.05, scaled-byte=~0.099, end=0.25]
        assert!(determinate.len() >= 2, "got {evs:?}");
        let scaled = determinate[1];
        assert!(
            (scaled - 0.099).abs() < 0.01,
            "expected ~0.099 (scaled), got {scaled} from {evs:?}"
        );
    }

    #[test]
    fn verify_is_its_own_phase_after_download() {
        // "Checking hash" exits download and enters the verify phase
        // (0.25 → 0.30). The bar fraction should advance into verify's
        // slice — gitkraken-sized hashing then gets a creep ticker on
        // the operations side.
        let (evs, _) = drive(
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
        assert_eq!(
            phase_names,
            vec!["download", "verify"],
            "got events {evs:?}"
        );
    }

    #[test]
    fn full_install_pipeline_fills_monotonically() {
        let (evs, _) = drive(
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
        // Each fraction must be >= the previous one. The bar never
        // goes backwards.
        for window in fractions.windows(2) {
            assert!(
                window[1] + 0.0001 >= window[0],
                "non-monotonic progress {:?} -> {:?} in full stream {:?}",
                window[0],
                window[1],
                fractions
            );
        }
        // Final fraction (from on_exit closing extract) should be
        // extract's end = 0.50.
        assert!(
            (fractions.last().copied().unwrap_or(0.0) - 0.50).abs() < 0.001,
            "expected final fraction 0.50, got {fractions:?}"
        );
    }

    #[test]
    fn dangling_phase_is_closed_on_exit() {
        let (evs, _) = drive(
            &[(execra::Stream::Stdout, "Downloading 'thing.zip'")],
            ExitCode::from_code(0),
        );
        let enters = evs
            .iter()
            .filter(|e| matches!(e, InterpreterEvent::EnterPhase { .. }))
            .count();
        let exits = evs
            .iter()
            .filter(|e| matches!(e, InterpreterEvent::ExitPhase))
            .count();
        assert_eq!(enters, exits, "enters must equal exits, got {evs:?}");
    }

    // --- Findings -------------------------------------------------------

    #[test]
    fn notes_block_collects_into_finding() {
        let (evs, _) = drive(
            &[
                (execra::Stream::Stdout, "'7zip' (24.09) was installed successfully!"),
                (execra::Stream::Stdout, "Notes"),
                (execra::Stream::Stdout, "-----"),
                (execra::Stream::Stdout, "Add the install dir to PATH"),
                (execra::Stream::Stdout, "Also: don't forget to restart shells"),
                (execra::Stream::Stdout, ""),
            ],
            ExitCode::from_code(0),
        );
        let finding = evs.iter().find_map(|e| match e {
            InterpreterEvent::Finding { finding } if finding.code == "scoop.notes" => Some(finding),
            _ => None,
        });
        let f = finding.expect(&format!("expected a scoop.notes Finding, got {evs:?}"));
        assert!(f.message.contains("Add the install dir to PATH"));
        assert!(f.message.contains("don't forget to restart shells"));
    }

    #[test]
    fn notes_block_flushes_on_exit_if_unterminated() {
        let (evs, _) = drive(
            &[
                (execra::Stream::Stdout, "Notes"),
                (execra::Stream::Stdout, "-----"),
                (execra::Stream::Stdout, "partial note line"),
            ],
            ExitCode::from_code(0),
        );
        assert!(
            evs.iter().any(|e| matches!(e, InterpreterEvent::Finding { finding } if finding.message.contains("partial note line"))),
            "expected partial-notes flush, got {evs:?}"
        );
    }

    // --- Fallback behavior ---------------------------------------------

    #[test]
    fn classified_error_is_not_re_emitted_on_exit() {
        let (evs, _) = drive(
            &[(execra::Stream::Stderr, "ERROR: something broke")],
            ExitCode::from_code(1),
        );
        let errors: Vec<_> = evs
            .iter()
            .filter(|e| matches!(e, InterpreterEvent::KnownError { .. }))
            .collect();
        assert_eq!(
            errors.len(),
            1,
            "expected exactly one KnownError, got {evs:?}"
        );
    }

    #[test]
    fn stderr_fallback_used_when_nothing_classified() {
        let (evs, _) = drive(
            &[
                (execra::Stream::Stdout, "doing stuff"),
                (execra::Stream::Stderr, "weird unstructured diagnostic"),
            ],
            ExitCode::from_code(7),
        );
        assert!(
            matches!(
                evs.last(),
                Some(InterpreterEvent::KnownError { message, .. })
                    if message.contains("weird unstructured diagnostic")
            ),
            "expected stderr fallback, got {evs:?}"
        );
    }

    #[test]
    fn success_exit_does_not_emit_fallback_error() {
        let (evs, _) = drive(
            &[(execra::Stream::Stderr, "harmless stderr chatter")],
            ExitCode::from_code(0),
        );
        assert!(
            !evs.iter()
                .any(|e| matches!(e, InterpreterEvent::KnownError { .. })),
            "no KnownError expected on clean exit, got {evs:?}"
        );
    }
}

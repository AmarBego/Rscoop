//! Authoritative operation state: queue + current + recent completed.
//!
//! State lives in Rust so it survives webview tear-down (close-to-tray).
//! The frontend is a thin mirror that hydrates via `get_operation_state`
//! and listens to `operation-output` / `operation-finished` /
//! `operation-state-changed` events to stay in sync.

use crate::commands::scoop::{self, ScoopOp};
use crate::commands::virustotal::{self, ScanWarning};
use crate::state::AppState;
use execra::tauri::ExecraExt;
use execra::Finding;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

const OUTPUT_BUFFER_CAP: usize = 5000;
const COMPLETED_HISTORY_CAP: usize = 20;

pub const EVENT_OUTPUT: &str = "operation-output";
pub const EVENT_FINISHED: &str = "operation-finished";
pub const EVENT_STATE_CHANGED: &str = "operation-state-changed";
pub const EVENT_RESTORE: &str = "operation-restore";

// --- Public DTOs -------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "kebab-case")]
pub enum OperationKind {
    Install,
    Update,
    UpdateAll,
    Uninstall,
    ClearCache,
    Cleanup,
    AutoUpdate,
    Scan,
}

#[derive(Serialize, Clone, Debug)]
pub struct OutputLine {
    pub line: String,
    pub source: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct CommandResult {
    pub success: bool,
    pub message: String,
    pub status: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct OperationWarning {
    pub code: String,
    pub message: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct CurrentOperation {
    pub id: String,
    #[serde(rename = "jobId", skip_serializing_if = "Option::is_none")]
    pub job_id: Option<execra::JobId>,
    pub title: String,
    pub kind: OperationKind,
    #[serde(rename = "packageName", skip_serializing_if = "Option::is_none")]
    pub package_name: Option<String>,
    pub output: Vec<OutputLine>,
    pub result: Option<CommandResult>,
    /// Most recent progress-phase hint emitted by the interpreter
    /// (e.g. "downloading", "verifying"). Cleared on finalize and on
    /// chain transitions. Frontend formats for display.
    ///
    /// When `phase_stack` is non-empty, that takes precedence in the UI.
    /// This field remains the fallback for progress hints emitted outside
    /// of a phase.
    #[serde(rename = "currentPhase", skip_serializing_if = "Option::is_none")]
    pub current_phase: Option<String>,
    /// Phase labels in nesting order — UI renders these as a breadcrumb
    /// ("Installing firefox › Downloading firefox").
    #[serde(rename = "phaseStack", skip_serializing_if = "Vec::is_empty")]
    pub phase_stack: Vec<String>,
    /// Determinate progress for the active phase, when the interpreter
    /// emitted a `Progress::Determinate` (e.g. byte progress during a
    /// download). Range 0..=1. `None` means indeterminate — the UI falls
    /// back to a marquee animation.
    #[serde(rename = "progressFraction", skip_serializing_if = "Option::is_none")]
    pub progress_fraction: Option<f32>,
    /// All warnings the interpreter raised for this op, in order. An empty
    /// vector is omitted from the wire format.
    #[serde(rename = "operationWarnings", skip_serializing_if = "Vec::is_empty")]
    pub operation_warnings: Vec<OperationWarning>,
    /// Findings the interpreter emitted (`Notes` blocks, recommendations,
    /// etc.). Empty vector is omitted from the wire format.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub findings: Vec<Finding>,
    /// Populated when a VirusTotal scan produced a warning — frontend shows
    /// the warning banner + "Install Anyway" button.
    #[serde(rename = "scanWarning", skip_serializing_if = "Option::is_none")]
    pub scan_warning: Option<ScanWarning>,
    /// True if the op has a pending install we can recover on "Install Anyway"
    /// (i.e. the original chain held an Install action).
    #[serde(rename = "canOverrideScan", default)]
    pub can_override_scan: bool,
    /// True if a deferred cache-clear chain is waiting for user confirmation
    /// (uninstall completed with auto-clear-cache off).
    #[serde(rename = "canClearCache", default)]
    pub can_clear_cache: bool,
}

#[derive(Serialize, Clone, Debug)]
pub struct QueuedOperation {
    pub id: String,
    pub title: String,
    pub kind: OperationKind,
    #[serde(rename = "packageName", skip_serializing_if = "Option::is_none")]
    pub package_name: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct CompletedOperation {
    pub id: String,
    pub title: String,
    pub kind: OperationKind,
    #[serde(rename = "packageName", skip_serializing_if = "Option::is_none")]
    pub package_name: Option<String>,
    pub success: bool,
    pub message: String,
    pub output: Vec<OutputLine>,
    pub status: String,
    #[serde(rename = "scanWarning", skip_serializing_if = "Option::is_none")]
    pub scan_warning: Option<ScanWarning>,
    #[serde(rename = "operationWarnings", skip_serializing_if = "Vec::is_empty")]
    pub operation_warnings: Vec<OperationWarning>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub findings: Vec<Finding>,
}

#[derive(Serialize, Clone, Debug, Default)]
pub struct OperationStateSnapshot {
    pub current: Option<CurrentOperation>,
    pub queue: Vec<QueuedOperation>,
    pub completed: Vec<CompletedOperation>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum EnqueueAction {
    Install {
        package: String,
        bucket: String,
        #[serde(default)]
        version: Option<String>,
    },
    Update {
        package: String,
    },
    UpdateAll,
    Uninstall {
        package: String,
        bucket: String,
        #[serde(default)]
        auto_clear_cache: bool,
    },
    ClearCache {
        package: String,
        bucket: String,
    },
    CleanupApps,
    CleanupCache,
    /// Raw scan. Not normally enqueued directly — use `ScanAndInstall` below.
    Scan {
        package: String,
        bucket: String,
    },
    /// Scan-then-install: runs `scoop virustotal`, then chains into install
    /// if clean. If detections or API-key-missing, halts with a warning the
    /// user can override via `confirm_install_anyway`.
    ScanAndInstall {
        package: String,
        bucket: String,
        #[serde(default)]
        version: Option<String>,
    },
}

impl EnqueueAction {
    fn title(&self) -> String {
        match self {
            EnqueueAction::Install {
                package, version, ..
            } => match version {
                Some(v) if !v.is_empty() => format!("Installing {}@{}", package, v),
                _ => format!("Installing {}", package),
            },
            EnqueueAction::Update { package } => format!("Updating {}", package),
            EnqueueAction::UpdateAll => "Updating all packages".to_string(),
            EnqueueAction::Uninstall { package, .. } => format!("Uninstalling {}", package),
            EnqueueAction::ClearCache { package, .. } => format!("Clearing cache for {}", package),
            EnqueueAction::CleanupApps => "Cleaning up old app versions".to_string(),
            EnqueueAction::CleanupCache => "Cleaning up outdated cache".to_string(),
            EnqueueAction::Scan { package, .. } | EnqueueAction::ScanAndInstall { package, .. } => {
                format!("Scanning {} with VirusTotal", package)
            }
        }
    }

    fn kind(&self) -> OperationKind {
        match self {
            EnqueueAction::Install { .. } => OperationKind::Install,
            EnqueueAction::Update { .. } => OperationKind::Update,
            EnqueueAction::UpdateAll => OperationKind::UpdateAll,
            EnqueueAction::Uninstall { .. } => OperationKind::Uninstall,
            EnqueueAction::ClearCache { .. } => OperationKind::ClearCache,
            EnqueueAction::CleanupApps | EnqueueAction::CleanupCache => OperationKind::Cleanup,
            EnqueueAction::Scan { .. } | EnqueueAction::ScanAndInstall { .. } => {
                OperationKind::Scan
            }
        }
    }

    fn package_name(&self) -> Option<String> {
        match self {
            EnqueueAction::Install { package, .. }
            | EnqueueAction::Update { package }
            | EnqueueAction::Uninstall { package, .. }
            | EnqueueAction::ClearCache { package, .. }
            | EnqueueAction::Scan { package, .. }
            | EnqueueAction::ScanAndInstall { package, .. } => Some(package.clone()),
            _ => None,
        }
    }
}

// --- Manager internals -------------------------------------------------------

#[derive(Clone)]
struct PendingOp {
    id: String,
    title: String,
    kind: OperationKind,
    package_name: Option<String>,
    action: EnqueueAction,
    /// Optional follow-up action. Runs in the same op if `auto_chain` is true;
    /// otherwise waits for the user to invoke `run_pending_chain`.
    chain: Option<Box<EnqueueAction>>,
    /// If false, the chain is a DEFERRED action (user must confirm — e.g.
    /// the "Clear Cache" button after an uninstall when auto-clear is off).
    auto_chain: bool,
}

struct ActiveOp {
    pending: PendingOp,
    job_id: Option<execra::JobId>,
    output: VecDeque<OutputLine>,
    /// Set when the op has finished. While Some, the op is still displayed
    /// as "current" so the user can see the result. It is moved into
    /// completed history only when (a) the next queued op starts, or
    /// (b) the user explicitly dismisses it via `dismiss_current_result`.
    result: Option<CommandResult>,
    scan_warning: Option<ScanWarning>,
    /// All interpreter warnings raised during this op. First entry drives
    /// the result-status downgrade ("warning") and is shown verbatim in the
    /// toast / bar; the rest render in a list inside the modal.
    operation_warnings: Vec<OperationWarning>,
    /// `Finding`s emitted by the interpreter — Notes blocks, recommendations,
    /// post-install hints. Surfaced in the modal/completed-op viewer.
    findings: Vec<Finding>,
    /// Set by the Execra interpreter via `KnownError` events. Surfaces a
    /// diagnostic message over the generic "process exited with code N".
    known_error: Option<String>,
    /// Set by the Execra interpreter via `Summary` events. Used as the
    /// success message in lieu of the generic "X completed successfully".
    summary: Option<String>,
    /// Latest indeterminate-progress hint from the interpreter. Drives the
    /// modal subtitle ("Downloading…", "Verifying…") when no phase is
    /// active. Reset between chained steps and cleared on finalize.
    current_phase: Option<String>,
    /// Phase stack maintained from `PhaseEntered` / `PhaseUpdated` /
    /// `PhaseExited` events. Top of stack is the deepest phase.
    phase_stack: Vec<String>,
    /// Determinate fraction for the active phase (0..=1), driven by
    /// interpreter byte progress and Execra's creep ticker (both arrive
    /// as `Progress::Determinate`). Reset on phase transitions.
    progress_fraction: Option<f32>,
}

impl ActiveOp {
    /// A fresh active op wrapping `pending` — all interpreter-derived
    /// state empty. The single place the field list is spelled out, so
    /// the four start sites (enqueue, synthetic, queue-advance ×2) can't
    /// drift apart.
    fn new(pending: PendingOp) -> Self {
        Self {
            pending,
            job_id: None,
            output: VecDeque::new(),
            result: None,
            scan_warning: None,
            operation_warnings: Vec::new(),
            findings: Vec::new(),
            known_error: None,
            summary: None,
            current_phase: None,
            phase_stack: Vec::new(),
            progress_fraction: None,
        }
    }
}

pub struct OperationManager {
    next_id: u64,
    current: Option<ActiveOp>,
    queue: VecDeque<PendingOp>,
    completed: VecDeque<CompletedOperation>,
}

impl OperationManager {
    pub fn new() -> Self {
        Self {
            next_id: 0,
            current: None,
            queue: VecDeque::new(),
            completed: VecDeque::new(),
        }
    }

    fn gen_id(&mut self) -> String {
        self.next_id += 1;
        format!("op-{}", self.next_id)
    }

    fn snapshot(&self) -> OperationStateSnapshot {
        OperationStateSnapshot {
            current: self.current.as_ref().map(|s| CurrentOperation {
                id: s.pending.id.clone(),
                job_id: s.job_id,
                title: s.pending.title.clone(),
                kind: s.pending.kind.clone(),
                package_name: s.pending.package_name.clone(),
                output: s.output.iter().cloned().collect(),
                result: s.result.clone(),
                current_phase: s.current_phase.clone(),
                phase_stack: s.phase_stack.clone(),
                progress_fraction: s.progress_fraction,
                operation_warnings: s.operation_warnings.clone(),
                findings: s.findings.clone(),
                scan_warning: s.scan_warning.clone(),
                can_override_scan: matches!(
                    s.pending.chain.as_deref(),
                    Some(EnqueueAction::Install { .. })
                ),
                can_clear_cache: !s.pending.auto_chain
                    && matches!(
                        s.pending.chain.as_deref(),
                        Some(EnqueueAction::ClearCache { .. })
                    )
                    && s.result.as_ref().map(|r| r.success).unwrap_or(false),
            }),
            queue: self
                .queue
                .iter()
                .map(|q| QueuedOperation {
                    id: q.id.clone(),
                    title: q.title.clone(),
                    kind: q.kind.clone(),
                    package_name: q.package_name.clone(),
                })
                .collect(),
            completed: self.completed.iter().cloned().collect(),
        }
    }
}

// --- Public API --------------------------------------------------------------

/// Accessor for the manager held in AppState.
fn manager(app: &AppHandle) -> tauri::State<'_, Mutex<OperationManager>> {
    app.state::<Mutex<OperationManager>>()
}

pub fn snapshot(app: &AppHandle) -> OperationStateSnapshot {
    manager(app).lock().unwrap().snapshot()
}

fn emit_state(app: &AppHandle) {
    let snap = snapshot(app);
    if let Err(e) = app.emit(EVENT_STATE_CHANGED, snap) {
        log::warn!("failed to emit state change: {}", e);
    }
}

/// Lock the manager, apply `f` to the current op (if any), and emit a
/// state-changed event iff `f` reports a visible change. Returns `f`'s
/// verdict (`false` when there is no current op). This collapses the
/// "lock → mutate current → maybe emit" boilerplate that every setter
/// below would otherwise repeat.
fn with_current_mut(app: &AppHandle, f: impl FnOnce(&mut ActiveOp) -> bool) -> bool {
    let changed = {
        let state = manager(app);
        let mut m = state.lock().unwrap();
        match m.current.as_mut() {
            Some(active) => f(active),
            None => false,
        }
    };
    if changed {
        emit_state(app);
    }
    changed
}

/// Whether an operation is currently running (either active or queued).
/// Used by the close-to-exit guard in lib.rs.
pub fn has_active_work(app: &AppHandle) -> bool {
    let state = manager(app);
    let m = state.lock().unwrap();
    let active_running = m
        .current
        .as_ref()
        .map(|s| s.result.is_none())
        .unwrap_or(false);
    active_running || !m.queue.is_empty()
}

/// What pending decision, if any, the current op is waiting on — drives
/// which action buttons we attach to the toast.
#[derive(Debug, Clone, Copy)]
enum PendingDecision {
    ClearCache,
    InstallAnyway,
}

/// Fire a Windows toast notifying the user an operation finished.
/// Skipped only when the main window is focused and visible (the user can
/// see the in-app result). Fires when the window is closed, minimized, or
/// behind other windows — so the user never misses a VT warning, failure,
/// or "already installed" result.
#[cfg(windows)]
fn notify_result(app: &AppHandle, title: &str, success: bool, status: &str, message: &str) {
    use tauri_winrt_notification::{Duration, Toast};

    if let Some(window) = app.get_webview_window("main") {
        if window.is_focused().unwrap_or(false) {
            return;
        }
    }

    // Inspect the current op to decide which action buttons (if any) to
    // attach. Scan warning → "Install Anyway"; deferred cache-clear chain
    // → "Clear Cache"; otherwise no action buttons.
    let decision: Option<PendingDecision> = {
        let state = manager(app);
        let m = state.lock().unwrap();
        m.current.as_ref().and_then(|a| {
            if a.scan_warning.is_some()
                && matches!(
                    a.pending.chain.as_deref(),
                    Some(EnqueueAction::Install { .. })
                )
            {
                Some(PendingDecision::InstallAnyway)
            } else if !a.pending.auto_chain
                && matches!(
                    a.pending.chain.as_deref(),
                    Some(EnqueueAction::ClearCache { .. })
                )
                && success
            {
                Some(PendingDecision::ClearCache)
            } else {
                None
            }
        })
    };

    let marker = match status {
        "warning" => "⚠",
        _ if success => "✓",
        _ => "✗",
    };
    let toast_title = format!("{} {}", title, marker);

    let mut toast = Toast::new(&resolve_aumid(app))
        .title(&toast_title)
        .text1(message)
        .duration(Duration::Short);

    match decision {
        Some(PendingDecision::ClearCache) => {
            toast = toast
                .add_button("Clear Cache", "clear-cache")
                .add_button("Dismiss", "dismiss");
        }
        Some(PendingDecision::InstallAnyway) => {
            toast = toast
                .add_button("Install Anyway", "install-anyway")
                .add_button("Cancel", "dismiss");
        }
        None => {}
    }

    // Activation callback — fires on body click (argument = None) and on
    // button click (argument = Some(action_id)).
    let app_for_cb = app.clone();
    toast = toast.on_activated(move |action: Option<String>| {
        let app = app_for_cb.clone();
        // Dispatch on the main thread: window recreation + Tauri command
        // invocations must not happen on the WinRT callback thread.
        let _ = app.clone().run_on_main_thread(move || {
            match action.as_deref() {
                Some("clear-cache") => {
                    if let Err(e) = run_pending_chain(&app) {
                        log::warn!("toast clear-cache failed: {}", e);
                    }
                    crate::tray::show_or_create_main_window(&app);
                    let _ = app.emit(EVENT_RESTORE, ());
                }
                Some("install-anyway") => {
                    if let Err(e) = confirm_install_anyway(&app) {
                        log::warn!("toast install-anyway failed: {}", e);
                    }
                    crate::tray::show_or_create_main_window(&app);
                    let _ = app.emit(EVENT_RESTORE, ());
                }
                Some("dismiss") => {
                    // No-op: let Windows hide the toast.
                }
                _ => {
                    // Body click or unknown action → restore the app and
                    // force the frontend to unminimize the operation modal
                    // so the user sees the result immediately.
                    crate::tray::show_or_create_main_window(&app);
                    let _ = app.emit(EVENT_RESTORE, ());
                }
            }
        });
        Ok(())
    });

    if let Err(e) = toast.show() {
        log::warn!("failed to show toast: {}", e);
    }
}

/// Pick the AppUserModelID for toasts. Uses our bundle identifier when the
/// binary is in an installed location (installer registers the AUMID via
/// the start-menu shortcut). In dev / raw `cargo build` binaries, we fall
/// back to PowerShell's AUMID so the toast still appears — the icon and
/// source name won't match rscoop, but actions still work.
#[cfg(windows)]
fn resolve_aumid(app: &AppHandle) -> String {
    use std::path::MAIN_SEPARATOR as SEP;
    use tauri_winrt_notification::Toast;

    let is_dev = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.display().to_string()))
        .map(|d| {
            d.ends_with(&format!("{SEP}target{SEP}debug"))
                || d.ends_with(&format!("{SEP}target{SEP}release"))
        })
        .unwrap_or(true);

    if is_dev {
        Toast::POWERSHELL_APP_ID.to_string()
    } else {
        app.config().identifier.clone()
    }
}

#[cfg(not(windows))]
fn notify_result(_app: &AppHandle, _title: &str, _success: bool, _status: &str, _message: &str) {
    // rscoop is Windows-only; no-op elsewhere.
}

/// Append one output line to the current operation and emit to the frontend.
///
/// This is a pure transcript append — `line`/`source` are preserved verbatim.
/// Any semantic classification (warning, error, success, progress) must come
/// through the Execra interpreter event path (see [`push_operation_warning`],
/// [`set_known_error`], etc.).
pub fn append_output(app: &AppHandle, line: String, source: &str) {
    let out = OutputLine {
        line,
        source: source.to_string(),
    };
    {
        let state = manager(app);
        let mut m = state.lock().unwrap();
        if let Some(active) = m.current.as_mut() {
            if active.output.len() >= OUTPUT_BUFFER_CAP {
                active.output.pop_front();
            }
            active.output.push_back(out.clone());
        }
    }
    let _ = app.emit(EVENT_OUTPUT, out);
}

/// Append a semantic warning surfaced by the interpreter (e.g. "running
/// processes prevented an update"). Duplicates by `(code, message)` are
/// suppressed so a chatty interpreter doesn't spam the UI.
pub fn push_operation_warning(app: &AppHandle, warning: OperationWarning) {
    with_current_mut(app, |active| {
        let dup = active
            .operation_warnings
            .iter()
            .any(|w| w.code == warning.code && w.message == warning.message);
        if !dup {
            active.operation_warnings.push(warning);
        }
        // Surfaced at finalize, not live — no emit needed.
        false
    });
}

/// Stash a semantic known-error surfaced by the interpreter. Used so the
/// runner can report the interpreter's diagnostic instead of a generic
/// "process exited with code N".
pub fn set_known_error(app: &AppHandle, message: String) {
    with_current_mut(app, |active| {
        if active.known_error.is_none() {
            active.known_error = Some(message);
        }
        false
    });
}

/// Stash an interpreter-provided summary line (e.g. "Installed firefox 1.2.3").
/// Used in place of the generic "X completed successfully" when present.
pub fn set_summary(app: &AppHandle, summary: String) {
    with_current_mut(app, |active| {
        active.summary = Some(summary);
        false
    });
}

/// Append a [`Finding`] surfaced by the interpreter (Notes block,
/// recommendation, etc.). Triggers a state-changed emit so the modal can
/// render new findings without waiting for finalize.
pub fn push_finding(app: &AppHandle, finding: Finding) {
    with_current_mut(app, |active| {
        active.findings.push(finding);
        true
    });
}

/// Push a phase label onto the active op's phase stack.
pub fn push_phase(app: &AppHandle, label: String) {
    with_current_mut(app, |active| {
        active.phase_stack.push(label);
        true
    });
}

/// Replace the label at the top of the phase stack. No-op when the stack
/// is empty.
pub fn update_top_phase(app: &AppHandle, label: String) {
    with_current_mut(app, |active| match active.phase_stack.last_mut() {
        Some(top) => {
            *top = label;
            true
        }
        None => false,
    });
}

/// Pop the top phase off the active op's phase stack. No-op when empty.
pub fn pop_phase(app: &AppHandle) {
    with_current_mut(app, |active| active.phase_stack.pop().is_some());
}

/// Update determinate progress for the active op (0..=1). Pass `None` to
/// switch back to indeterminate. Throttled to whole-percent changes — we
/// don't need to emit state on every byte of stdout (or every creep tick);
/// the wire savings are large during big downloads.
///
/// The creep ticker that fills opaque phases now lives in Execra
/// (`TaskBuilder::creep`); it arrives here as synthetic `ProgressUpdated`
/// events routed through this same setter.
pub fn set_progress_fraction(app: &AppHandle, fraction: Option<f32>) {
    with_current_mut(app, |active| {
        let new_pct = fraction.map(|f| (f * 100.0).round() as i32);
        let old_pct = active.progress_fraction.map(|f| (f * 100.0).round() as i32);
        if new_pct != old_pct {
            active.progress_fraction = fraction;
            true
        } else {
            false
        }
    });
}

/// Update the active op's current progress phase. Pass `None` to clear
/// (e.g. on finalize). Triggers a state-changed emit so the modal subtitle
/// stays in sync without per-output round-trips.
pub fn set_current_phase(app: &AppHandle, phase: Option<String>) {
    with_current_mut(app, |active| {
        if active.current_phase != phase {
            active.current_phase = phase;
            true
        } else {
            false
        }
    });
}

pub fn set_current_job(app: &AppHandle, job_id: Option<execra::JobId>) {
    {
        let state = manager(app);
        let mut m = state.lock().unwrap();
        if let Some(active) = m.current.as_mut() {
            active.job_id = job_id;
        }
    }
    emit_state(app);
}

pub fn cancel_current_job(app: &AppHandle) -> Result<bool, String> {
    let job_id = {
        let state = manager(app);
        let m = state.lock().unwrap();
        m.current.as_ref().and_then(|active| active.job_id)
    };

    match job_id {
        Some(id) => {
            app.execra().cancel(id).map_err(|e| e.to_string())?;
            Ok(true)
        }
        None => Ok(false),
    }
}

/// Enqueue an action. Starts immediately if idle; otherwise queues.
pub fn enqueue(app: &AppHandle, action: EnqueueAction) -> String {
    let (primary, chain, auto_chain) = expand_action(action);
    let (id, to_run) = {
        let state = manager(app);
        let mut m = state.lock().unwrap();
        // If the current op has already finished and is just sitting for
        // display, move it to completed so we can start the new one.
        archive_finished_current(&mut m);

        let id = m.gen_id();
        let pending = PendingOp {
            id: id.clone(),
            title: primary.title(),
            kind: primary.kind(),
            package_name: primary.package_name(),
            action: primary,
            chain,
            auto_chain,
        };
        if m.current.is_none() {
            m.current = Some(ActiveOp::new(pending.clone()));
            (id, Some(pending))
        } else {
            m.queue.push_back(pending);
            (id, None)
        }
    };
    emit_state(app);
    if let Some(p) = to_run {
        spawn_runner(app.clone(), p);
    }
    id
}

/// Returns (primary_action, optional_chain_action, auto_chain) for an
/// enqueued request. Meta-actions like `ScanAndInstall` expand into
/// primary + chain. `auto_chain=false` means the chain is deferred —
/// waits for explicit user confirmation (e.g. manual Clear Cache button).
fn expand_action(action: EnqueueAction) -> (EnqueueAction, Option<Box<EnqueueAction>>, bool) {
    match action {
        EnqueueAction::ScanAndInstall {
            package,
            bucket,
            version,
        } => (
            EnqueueAction::Scan {
                package: package.clone(),
                bucket: bucket.clone(),
            },
            Some(Box::new(EnqueueAction::Install {
                package,
                bucket,
                version,
            })),
            true,
        ),
        EnqueueAction::Uninstall {
            ref package,
            ref bucket,
            auto_clear_cache,
        } => {
            let chain = Some(Box::new(EnqueueAction::ClearCache {
                package: package.clone(),
                bucket: bucket.clone(),
            }));
            (action, chain, auto_clear_cache)
        }
        other => (other, None, true),
    }
}

/// Remove a queued operation by id. Returns true if removed.
pub fn remove_queued(app: &AppHandle, id: &str) -> bool {
    let removed = {
        let state = manager(app);
        let mut m = state.lock().unwrap();
        let before = m.queue.len();
        m.queue.retain(|q| q.id != id);
        m.queue.len() != before
    };
    if removed {
        emit_state(app);
    }
    removed
}

/// Clear completed history.
pub fn clear_completed(app: &AppHandle) {
    {
        let state = manager(app);
        let mut m = state.lock().unwrap();
        m.completed.clear();
    }
    emit_state(app);
}

/// Moves `current` (which must have `result` set) into the completed ring
/// buffer. Returns whether anything was moved.
fn archive_finished_current(m: &mut OperationManager) -> bool {
    let should_archive = m
        .current
        .as_ref()
        .map(|a| a.result.is_some())
        .unwrap_or(false);
    if !should_archive {
        return false;
    }
    if let Some(active) = m.current.take() {
        let result = active.result.expect("checked above");
        let completed = CompletedOperation {
            id: active.pending.id,
            title: active.pending.title,
            kind: active.pending.kind,
            package_name: active.pending.package_name,
            success: result.success,
            message: result.message,
            output: active.output.into_iter().collect(),
            status: result.status,
            scan_warning: active.scan_warning,
            operation_warnings: active.operation_warnings,
            findings: active.findings,
        };
        if m.completed.len() >= COMPLETED_HISTORY_CAP {
            m.completed.pop_front();
        }
        m.completed.push_back(completed);
    }
    true
}

/// Tag the finished current op with `result`, then decide what's next:
/// if the queue is non-empty, archive the finished op and promote the
/// queue head to current (returning it so the caller can spawn a runner);
/// otherwise leave the finished op as current so the user can see the
/// outcome until they dismiss it or enqueue something new.
///
/// The post-completion bookkeeping was duplicated verbatim in
/// `run_action` and `finish_synthetic` — this is the single copy.
fn advance_or_linger(m: &mut OperationManager, result: CommandResult) -> Option<PendingOp> {
    if let Some(active) = m.current.as_mut() {
        active.result = Some(result);
    }
    if m.queue.is_empty() {
        return None;
    }
    // `result` is set above, so this moves the finished op into history.
    archive_finished_current(m);
    let next = m.queue.pop_front();
    if let Some(p) = next.clone() {
        m.current = Some(ActiveOp::new(p));
    }
    next
}

/// Runs the current op's deferred chain (e.g. the cache-clear after an
/// uninstall when auto-clear was off). Extracts the chain action and
/// enqueues it as a fresh op; the original finished op is archived.
pub fn run_pending_chain(app: &AppHandle) -> Result<(), String> {
    let chain_action = {
        let state = manager(app);
        let m = state.lock().unwrap();
        m.current.as_ref().and_then(|a| {
            if a.pending.auto_chain {
                return None;
            }
            a.pending.chain.as_deref().cloned()
        })
    };
    match chain_action {
        Some(action) => {
            enqueue(app, action);
            Ok(())
        }
        None => Err("No deferred chain available".to_string()),
    }
}

/// After a scan warning, the user can opt to proceed with the install it was
/// guarding. This extracts the install action from the current op's chain
/// and enqueues it — the finished scan op is archived automatically.
pub fn confirm_install_anyway(app: &AppHandle) -> Result<(), String> {
    let install_action = {
        let state = manager(app);
        let m = state.lock().unwrap();
        m.current
            .as_ref()
            .and_then(|a| a.pending.chain.as_deref().cloned())
    };
    match install_action {
        Some(action @ EnqueueAction::Install { .. }) => {
            enqueue(app, action);
            Ok(())
        }
        _ => Err("No pending install to confirm".to_string()),
    }
}

/// Explicit dismissal of a finished current op — moves it to completed.
pub fn dismiss_current_result(app: &AppHandle) {
    let changed = {
        let state = manager(app);
        let mut m = state.lock().unwrap();
        archive_finished_current(&mut m)
    };
    if changed {
        emit_state(app);
    }
}

/// Directly mark an op as "current" without dispatching a runner. Used by
/// background tasks (e.g. the auto-update scheduler) that drive their own
/// work but still want it to show in the UI / survive webview teardown.
/// Returns the id, or `None` if something else is already running.
pub fn start_synthetic(
    app: &AppHandle,
    title: String,
    kind: OperationKind,
    package_name: Option<String>,
) -> Option<String> {
    let id = {
        let state = manager(app);
        let mut m = state.lock().unwrap();
        if m.current.is_some() {
            return None;
        }
        let id = m.gen_id();
        m.current = Some(ActiveOp::new(PendingOp {
            id: id.clone(),
            title,
            kind,
            package_name,
            // Sentinel — never executed because no runner is spawned.
            action: EnqueueAction::UpdateAll,
            chain: None,
            auto_chain: true,
        }));
        id
    };
    emit_state(app);
    Some(id)
}

/// Complete a synthetic op: emit finished, decide queue vs. linger, notify.
pub fn finish_synthetic(app: &AppHandle, success: bool, message: String) {
    let result = CommandResult {
        success,
        message: message.clone(),
        status: if success { "success" } else { "error" }.to_string(),
    };
    let _ = app.emit(EVENT_FINISHED, result.clone());

    // Capture the synthetic op's title for the toast before we mutate state.
    let title = {
        let state = manager(app);
        let m = state.lock().unwrap();
        m.current
            .as_ref()
            .map(|a| a.pending.title.clone())
            .unwrap_or_else(|| "Background task".to_string())
    };
    notify_result(app, &title, success, &result.status, &message);

    let next = {
        let state = manager(app);
        let mut m = state.lock().unwrap();
        advance_or_linger(&mut m, result.clone())
    };

    emit_state(app);

    if let Some(p) = next {
        spawn_runner(app.clone(), p);
    }
}

// --- Runner ------------------------------------------------------------------

fn spawn_runner(app: AppHandle, pending: PendingOp) {
    tauri::async_runtime::spawn(async move {
        run_action(app, pending).await;
    });
}

async fn run_action(app: AppHandle, pending: PendingOp) {
    // Execute the primary action
    let primary_result = execute_action(&app, &pending.action).await;

    // If success and there's an auto chain, run it in the SAME op
    // (output continues to stream into the same current op, no new modal).
    // Deferred chains (auto_chain=false) are left on the op for the user
    // to invoke later via `run_pending_chain`.
    let final_result = if primary_result.is_ok() && pending.chain.is_some() && pending.auto_chain {
        let chain_ref = pending.chain.as_deref().unwrap();
        let chain_title = chain_ref.title();
        // Emit a visual separator and flip the title to reflect the new phase.
        append_output(&app, format!("\n--- {} ---", chain_title), "stdout");
        update_current_title(&app, chain_title);
        // Wipe interpreter-derived state so the chain's outcome is reported
        // on its own — not contaminated by the primary action's summary/etc.
        reset_semantic_state(&app);
        emit_state(&app);
        execute_action(&app, chain_ref).await
    } else {
        primary_result
    };

    let (has_scan_warning, first_warning, warning_count, summary, known_error) = {
        let state = manager(&app);
        let m = state.lock().unwrap();
        let active = m.current.as_ref();
        let warnings = active
            .map(|a| a.operation_warnings.as_slice())
            .unwrap_or(&[]);
        (
            active.and_then(|a| a.scan_warning.as_ref()).is_some(),
            warnings.first().cloned(),
            warnings.len(),
            active.and_then(|a| a.summary.clone()),
            active.and_then(|a| a.known_error.clone()),
        )
    };

    // Build result message. Interpreter-provided summary/known-error take
    // precedence over generic strings; warnings flip status without flipping
    // success. When multiple warnings fired, the first carries the message
    // and the count is appended ("…and 2 more") so the toast/bar stays
    // single-line while the modal renders the full list.
    let result = match &final_result {
        Ok(()) if let Some(warning) = first_warning => CommandResult {
            success: true,
            message: if warning_count > 1 {
                format!("{} (+{} more)", warning.message, warning_count - 1)
            } else {
                warning.message
            },
            status: "warning".to_string(),
        },
        Ok(()) => CommandResult {
            success: true,
            message: summary
                .unwrap_or_else(|| format!("{} completed successfully", pending.title)),
            status: "success".to_string(),
        },
        Err(e) if has_scan_warning => CommandResult {
            success: true,
            message: "Scan completed with warnings".to_string(),
            status: "warning".to_string(),
        },
        Err(e) => CommandResult {
            success: false,
            message: known_error.unwrap_or_else(|| e.clone()),
            status: "error".to_string(),
        },
    };

    // Run post-op hooks (auto cleanup, cache invalidation) for package ops.
    // Fire-and-forget; these mirror what the legacy commands did inline.
    run_post_hooks(&app, &pending, &final_result).await;

    // Emit finished event before moving state so listeners see the result.
    let _ = app.emit(EVENT_FINISHED, result.clone());

    // Grab the live title — may have transitioned (scan → install) during
    // chain execution.
    let toast_title = {
        let state = manager(&app);
        let m = state.lock().unwrap();
        m.current
            .as_ref()
            .map(|a| a.pending.title.clone())
            .unwrap_or_else(|| pending.title.clone())
    };
    notify_result(
        &app,
        &toast_title,
        result.success,
        &result.status,
        &result.message,
    );

    // Decide: if there's a queued op, move current → completed and start it.
    // Otherwise keep current with result set so the user can see the outcome
    // until they dismiss or enqueue something new.
    let next = {
        let state = manager(&app);
        let mut m = state.lock().unwrap();
        advance_or_linger(&mut m, result.clone())
    };

    emit_state(&app);

    if let Some(p) = next {
        spawn_runner(app, p);
    }
}

/// Stash a scan warning on the currently-active op. Called from the Scan
/// execute path so the frontend can render the warning UI after state sync.
fn set_scan_warning(app: &AppHandle, warning: ScanWarning) {
    with_current_mut(app, |active| {
        active.scan_warning = Some(warning);
        false
    });
}

/// Reset semantic state captured by the previous step in a chained operation.
/// Each step gets its own clean slate for summary/warning/known-error.
fn reset_semantic_state(app: &AppHandle) {
    with_current_mut(app, |active| {
        active.operation_warnings.clear();
        active.findings.clear();
        active.known_error = None;
        active.summary = None;
        active.current_phase = None;
        active.phase_stack.clear();
        active.progress_fraction = None;
        false
    });
}

/// Update the title of the current op in-place. Used when the op transitions
/// phases (e.g. "Scanning firefox" → "Installing firefox" after a clean scan).
fn update_current_title(app: &AppHandle, new_title: String) {
    with_current_mut(app, |active| {
        active.pending.title = new_title;
        false
    });
}

async fn execute_action(app: &AppHandle, action: &EnqueueAction) -> Result<(), String> {
    match action {
        EnqueueAction::Install {
            package,
            bucket,
            version,
        } => {
            let has_version = matches!(version, Some(v) if !v.is_empty());
            let bucket_opt = if has_version {
                None
            } else {
                crate::utils::is_valid_bucket(bucket).then(|| bucket.as_str())
            };
            let target = match version {
                Some(v) if !v.is_empty() => format!("{}@{}", package, v),
                _ => package.clone(),
            };
            scoop::execute_scoop(app.clone(), ScoopOp::Install, Some(&target), bucket_opt).await
        }
        EnqueueAction::Update { package } => {
            scoop::execute_scoop(app.clone(), ScoopOp::Update, Some(package), None).await
        }
        EnqueueAction::UpdateAll => {
            scoop::execute_scoop(app.clone(), ScoopOp::UpdateAll, None, None).await
        }
        EnqueueAction::Uninstall {
            package, bucket, ..
        } => {
            let bucket_opt = crate::utils::is_valid_bucket(bucket).then(|| bucket.as_str());
            scoop::execute_scoop(app.clone(), ScoopOp::Uninstall, Some(package), bucket_opt).await
        }
        EnqueueAction::ClearCache { package, bucket } => {
            let bucket_opt = crate::utils::is_valid_bucket(bucket).then(|| bucket.as_str());
            scoop::execute_scoop(app.clone(), ScoopOp::ClearCache, Some(package), bucket_opt).await
        }
        EnqueueAction::CleanupApps => {
            crate::commands::doctor::cleanup::cleanup_all_apps_internal(app.clone()).await
        }
        EnqueueAction::CleanupCache => {
            crate::commands::doctor::cleanup::cleanup_outdated_cache_internal(app.clone()).await
        }
        EnqueueAction::Scan { package, bucket } => {
            let bucket_opt = crate::utils::is_valid_bucket(bucket).then(|| bucket.as_str());
            let outcome = virustotal::run_scan(app.clone(), package, bucket_opt).await?;
            if let Some(warning) = virustotal::scan_warning(&outcome) {
                let msg = warning.message.clone();
                set_scan_warning(app, warning);
                Err(msg)
            } else if outcome.is_success() {
                Ok(())
            } else {
                Err(outcome.message())
            }
        }
        EnqueueAction::ScanAndInstall { .. } => {
            // Should never reach here: ScanAndInstall is expanded into
            // primary=Scan + chain=Install at enqueue time.
            Err("ScanAndInstall was not expanded before execution".to_string())
        }
    }
}

async fn run_post_hooks(app: &AppHandle, pending: &PendingOp, result: &Result<(), String>) {
    use crate::commands::installed::invalidate_installed_cache;
    use crate::commands::search::invalidate_manifest_cache;
    let state = app.state::<AppState>();

    match pending.action {
        EnqueueAction::Install { .. }
        | EnqueueAction::Uninstall { .. }
        | EnqueueAction::Update { .. }
        | EnqueueAction::UpdateAll => {
            invalidate_manifest_cache(&state.scoop_path()).await;
            invalidate_installed_cache(state.clone()).await;
            // Auto-cleanup fires regardless of success on the original impl;
            // mirror that.
            crate::commands::auto_cleanup::trigger_auto_cleanup(app.clone(), state).await;
        }
        _ => {}
    }
    let _ = result;
}

//! Authoritative operation state: queue + current + recent completed.
//!
//! State lives in Rust so it survives webview tear-down (close-to-tray).
//! The frontend is a thin mirror that hydrates via `get_operation_state`
//! and listens to `operation-output` / `operation-finished` /
//! `operation-state-changed` events to stay in sync.

use crate::commands::scoop::{self, ScoopOp};
use crate::commands::virustotal::{self, ScanOutcome, ScanWarning};
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

const OUTPUT_BUFFER_CAP: usize = 5000;
const COMPLETED_HISTORY_CAP: usize = 20;

pub const EVENT_OUTPUT: &str = "operation-output";
pub const EVENT_FINISHED: &str = "operation-finished";
pub const EVENT_STATE_CHANGED: &str = "operation-state-changed";
pub const EVENT_CANCEL: &str = "cancel-operation";

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
}

#[derive(Serialize, Clone, Debug)]
pub struct CurrentOperation {
    pub id: String,
    pub title: String,
    pub kind: OperationKind,
    #[serde(rename = "packageName", skip_serializing_if = "Option::is_none")]
    pub package_name: Option<String>,
    pub output: Vec<OutputLine>,
    pub result: Option<CommandResult>,
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
    #[serde(rename = "scanWarning", skip_serializing_if = "Option::is_none")]
    pub scan_warning: Option<ScanWarning>,
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
            EnqueueAction::Install { package, version, .. } => match version {
                Some(v) if !v.is_empty() => format!("Installing {}@{}", package, v),
                _ => format!("Installing {}", package),
            },
            EnqueueAction::Update { package } => format!("Updating {}", package),
            EnqueueAction::UpdateAll => "Updating all packages".to_string(),
            EnqueueAction::Uninstall { package, .. } => format!("Uninstalling {}", package),
            EnqueueAction::ClearCache { package, .. } => format!("Clearing cache for {}", package),
            EnqueueAction::CleanupApps => "Cleaning up old app versions".to_string(),
            EnqueueAction::CleanupCache => "Cleaning up outdated cache".to_string(),
            EnqueueAction::Scan { package, .. }
            | EnqueueAction::ScanAndInstall { package, .. } => {
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
    output: VecDeque<OutputLine>,
    /// Set when the op has finished. While Some, the op is still displayed
    /// as "current" so the user can see the result. It is moved into
    /// completed history only when (a) the next queued op starts, or
    /// (b) the user explicitly dismisses it via `dismiss_current_result`.
    result: Option<CommandResult>,
    scan_warning: Option<ScanWarning>,
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
                title: s.pending.title.clone(),
                kind: s.pending.kind.clone(),
                package_name: s.pending.package_name.clone(),
                output: s.output.iter().cloned().collect(),
                result: s.result.clone(),
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

/// Fire a Windows toast notifying the user an operation finished.
/// Only notifies when the main webview window has been destroyed — if the
/// window still exists (open, minimized, or in the background), the user
/// will see the completion in the operation modal / bar, so a toast would
/// just be noise. The window can only be destroyed while the app keeps
/// running via close-to-tray, so this also implicitly honors that setting.
fn notify_result(app: &AppHandle, title: &str, success: bool, message: &str) {
    if app.get_webview_window("main").is_some() {
        return;
    }

    // Look at the current op to see if there's a pending action the user
    // should know about (deferred chain or scan warning). Action-buttons
    // on Windows toasts need a COM activator we don't ship, so we settle
    // for surfacing the hint in the body instead.
    let pending_hint: Option<String> = {
        let state = manager(app);
        let m = state.lock().unwrap();
        m.current.as_ref().and_then(|a| {
            if a.scan_warning.is_some() {
                return Some("Review detections in rscoop".to_string());
            }
            if !a.pending.auto_chain {
                if let Some(chain) = a.pending.chain.as_deref() {
                    return Some(format!("Action required: {}", chain.title()));
                }
            }
            None
        })
    };

    let (marker, body) = match (success, pending_hint) {
        (true, Some(hint)) => ("⚠", format!("{} — {}", message, hint)),
        (false, Some(hint)) => ("✗", format!("{} — {}", message, hint)),
        (true, None) => ("✓", message.to_string()),
        (false, None) => ("✗", message.to_string()),
    };

    let toast_title = format!("{} {}", title, marker);

    if let Err(e) = app
        .notification()
        .builder()
        .title(toast_title)
        .body(body)
        .show()
    {
        log::warn!("failed to show notification: {}", e);
    }
}

/// Append one output line to the current operation and emit to the frontend.
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
            m.current = Some(ActiveOp {
                pending: pending.clone(),
                output: VecDeque::new(),
                result: None,
                scan_warning: None,
            });
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
fn expand_action(
    action: EnqueueAction,
) -> (EnqueueAction, Option<Box<EnqueueAction>>, bool) {
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
            scan_warning: active.scan_warning,
        };
        if m.completed.len() >= COMPLETED_HISTORY_CAP {
            m.completed.pop_front();
        }
        m.completed.push_back(completed);
    }
    true
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
        m.current = Some(ActiveOp {
            pending: PendingOp {
                id: id.clone(),
                title,
                kind,
                package_name,
                // Sentinel — never executed because no runner is spawned.
                action: EnqueueAction::UpdateAll,
                chain: None,
                auto_chain: true,
            },
            output: VecDeque::new(),
            result: None,
            scan_warning: None,
        });
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
    notify_result(app, &title, success, &message);

    let next = {
        let state = manager(app);
        let mut m = state.lock().unwrap();
        let has_queued = !m.queue.is_empty();
        if has_queued {
            if let Some(active) = m.current.as_mut() {
                active.result = Some(result.clone());
            }
            archive_finished_current(&mut m);
            let next = m.queue.pop_front();
            if let Some(p) = next.clone() {
                m.current = Some(ActiveOp {
                    pending: p,
                    output: VecDeque::new(),
                    result: None,
                    scan_warning: None,
                });
            }
            next
        } else {
            if let Some(active) = m.current.as_mut() {
                active.result = Some(result.clone());
            }
            None
        }
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
        emit_state(&app);
        execute_action(&app, chain_ref).await
    } else {
        primary_result
    };

    // Build result message
    let result = match &final_result {
        Ok(()) => CommandResult {
            success: true,
            message: format!("{} completed successfully", pending.title),
        },
        Err(e) => CommandResult {
            success: false,
            message: e.clone(),
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
    notify_result(&app, &toast_title, result.success, &result.message);

    // Decide: if there's a queued op, move current → completed and start it.
    // Otherwise keep current with result set so the user can see the outcome
    // until they dismiss or enqueue something new.
    let next = {
        let state = manager(&app);
        let mut m = state.lock().unwrap();
        let has_queued = !m.queue.is_empty();
        if has_queued {
            // Stash the result on current so archive_finished_current sees it.
            if let Some(active) = m.current.as_mut() {
                active.result = Some(result.clone());
            }
            archive_finished_current(&mut m);
            let next = m.queue.pop_front();
            if let Some(p) = next.clone() {
                m.current = Some(ActiveOp {
                    pending: p,
                    output: VecDeque::new(),
                    result: None,
                    scan_warning: None,
                });
            }
            next
        } else {
            // No queue: keep the op as current, just tag the result.
            if let Some(active) = m.current.as_mut() {
                active.result = Some(result.clone());
            }
            None
        }
    };

    emit_state(&app);

    if let Some(p) = next {
        spawn_runner(app, p);
    }
}

/// Stash a scan warning on the currently-active op. Called from the Scan
/// execute path so the frontend can render the warning UI after state sync.
fn set_scan_warning(app: &AppHandle, warning: ScanWarning) {
    let state = manager(app);
    let mut m = state.lock().unwrap();
    if let Some(active) = m.current.as_mut() {
        active.scan_warning = Some(warning);
    }
}

/// Update the title of the current op in-place. Used when the op transitions
/// phases (e.g. "Scanning firefox" → "Installing firefox" after a clean scan).
fn update_current_title(app: &AppHandle, new_title: String) {
    let state = manager(app);
    let mut m = state.lock().unwrap();
    if let Some(active) = m.current.as_mut() {
        active.pending.title = new_title;
    }
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
        EnqueueAction::Uninstall { package, bucket, .. } => {
            let bucket_opt = crate::utils::is_valid_bucket(bucket).then(|| bucket.as_str());
            scoop::execute_scoop(app.clone(), ScoopOp::Uninstall, Some(package), bucket_opt).await
        }
        EnqueueAction::ClearCache { package, bucket } => {
            let bucket_opt = crate::utils::is_valid_bucket(bucket).then(|| bucket.as_str());
            scoop::execute_scoop(app.clone(), ScoopOp::ClearCache, Some(package), bucket_opt).await
        }
        EnqueueAction::CleanupApps => {
            // Use the existing cleanup command; it streams via the manager
            // when invoked through run_and_stream_command.
            crate::commands::doctor::cleanup::cleanup_all_apps_internal(app.clone()).await
        }
        EnqueueAction::CleanupCache => {
            crate::commands::doctor::cleanup::cleanup_outdated_cache_internal(app.clone()).await
        }
        EnqueueAction::Scan { package, bucket } => {
            let bucket_opt = crate::utils::is_valid_bucket(bucket).then(|| bucket.as_str());
            match virustotal::run_scan(app.clone(), package, bucket_opt).await {
                Ok(ScanOutcome::Clean) => Ok(()),
                Ok(ScanOutcome::Warning(w)) => {
                    let msg = w.message.clone();
                    set_scan_warning(app, w);
                    Err(msg)
                }
                Err(e) => Err(e),
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
            invalidate_manifest_cache().await;
            invalidate_installed_cache(state.clone()).await;
            // Auto-cleanup fires regardless of success on the original impl;
            // mirror that.
            crate::commands::auto_cleanup::trigger_auto_cleanup(app.clone(), state).await;
        }
        _ => {}
    }
    let _ = result;
}

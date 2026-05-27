import { createRoot, createSignal } from "solid-js";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { ScoopPackage } from "../types/scoop";
import installedPackagesStore from "./installedPackagesStore";
import settingsStore from "./settings";
import { getErrorMessage } from "../utils/errors";

export interface ScanWarning {
  detectionsFound: boolean;
  isApiKeyMissing: boolean;
  message: string;
}

/// Mirrors `OperationWarning` in `src-tauri/src/operations.rs`. A semantic
/// warning surfaced by the Execra interpreter — e.g. running-process,
/// uncommitted-changes, already-installed.
export interface OperationWarning {
  code: string;
  message: string;
}

/// Mirrors Execra's `Finding` — a structured note/recommendation the
/// interpreter attached to the op (e.g. a "Notes" block from a scoop
/// install). `action` is intentionally kept loose; we only render the
/// message + severity today, but the shape is preserved so a future UI
/// can offer the suggested command/link.
export interface OperationFinding {
  severity: "info" | "recommendation" | "warning" | "error";
  code: string;
  message: string;
  action?: unknown;
  related?: unknown;
}

// --- Types ---
// These mirror the Rust-side DTOs in `src-tauri/src/operations.rs`.

interface OperationOutput {
  line: string;
  source: string;
}

interface OperationResult {
  success: boolean;
  message: string;
  status?: "success" | "warning" | "error";
}

export type OperationKind =
  | "install"
  | "update"
  | "update-all"
  | "uninstall"
  | "clear-cache"
  | "cleanup"
  | "auto-update"
  | "scan";

export interface Operation {
  id: string;
  jobId?: string;
  title: string;
  kind: OperationKind;
  packageName?: string;
  output: OperationOutput[];
  result: OperationResult | null;
  // Most recent progress phase the Execra interpreter reported
  // (e.g. "downloading", "verifying"). Used as the modal subtitle fallback
  // when no real phase is active. UI formats with `formatPhase`.
  currentPhase: string | null;
  // Phase stack from Execra's PhaseEntered/Exited events. Rendered as a
  // breadcrumb ("Installing firefox › Downloading firefox") and takes
  // precedence over `currentPhase` when non-empty.
  phaseStack: string[];
  // Determinate progress fraction (0..=1) for the active phase — e.g.
  // bytes downloaded out of total. Null = indeterminate (marquee bar).
  progressFraction: number | null;
  // All semantic warnings the interpreter raised for this op. Empty when
  // the op had a clean run.
  operationWarnings: OperationWarning[];
  // Interpreter-emitted findings (Notes blocks, recommendations).
  findings: OperationFinding[];
  // Set by Rust when a VirusTotal scan finishes with detections or a
  // missing API key. Frontend renders the warning + "Install Anyway" path.
  scanWarning: ScanWarning | null;
  // True if the op is a scan whose chain holds an Install we can override to.
  canOverrideScan: boolean;
  // True if the op is a finished uninstall with a deferred Clear Cache
  // chain waiting on user confirmation.
  canClearCache: boolean;
  // True while the op is in scan phase (kind === "scan" with no result yet).
  isScan: boolean;
}

export interface CompletedOperation {
  id: string;
  title: string;
  kind: OperationKind;
  packageName?: string;
  success: boolean;
  status?: "success" | "warning" | "error";
  output: OperationOutput[];
  message: string;
  // Wire-omitted when empty (Rust side uses skip_serializing_if = Vec::is_empty).
  operationWarnings?: OperationWarning[];
  findings?: OperationFinding[];
}

export interface QueuedOperation {
  id: string;
  title: string;
  kind: OperationKind;
  packageName?: string;
}

interface StateSnapshot {
  current: {
    id: string;
    jobId?: string;
    title: string;
    kind: OperationKind;
    packageName?: string;
    output: OperationOutput[];
    result: OperationResult | null;
    currentPhase?: string;
    phaseStack?: string[];
    progressFraction?: number;
    operationWarnings?: OperationWarning[];
    findings?: OperationFinding[];
    scanWarning?: ScanWarning;
    canOverrideScan?: boolean;
    canClearCache?: boolean;
  } | null;
  queue: QueuedOperation[];
  completed: CompletedOperation[];
}

// --- Store ---

function createOperationsStore() {
  // Mirror of Rust state. `current`/`queue`/`completed` are authoritative
  // on the Rust side; we only track them locally to drive reactive UI.
  const [current, setCurrent] = createSignal<Operation | null>(null);
  const [queue, setQueue] = createSignal<QueuedOperation[]>([]);
  const [completed, setCompleted] = createSignal<CompletedOperation[]>([]);
  const [isMinimized, setIsMinimized] = createSignal(false);
  let lastCurrentId: string | null = null;


  // --- Post-op callbacks (frontend-only) ---
  // Since Rust drives the queue we can't carry closures with the op. Instead,
  // we register {packageName, kind} → callback, and fire on matching finish.
  interface FinishCallback {
    predicate: (op: CompletedOperation) => boolean;
    cb: (wasSuccess: boolean) => void;
  }
  let finishCallbacks: FinishCallback[] = [];

  function onNextFinish(predicate: FinishCallback["predicate"], cb: FinishCallback["cb"]) {
    finishCallbacks.push({ predicate, cb });
  }

  function fireFinishCallbacks(op: CompletedOperation) {
    const remaining: FinishCallback[] = [];
    for (const fc of finishCallbacks) {
      if (fc.predicate(op)) {
        try { fc.cb(op.success); } catch (e) { console.error("finish callback threw:", getErrorMessage(e)); }
      } else {
        remaining.push(fc);
      }
    }
    finishCallbacks = remaining;
  }

  // --- Hydration ---

  function applySnapshot(snap: StateSnapshot) {
    setQueue(snap.queue);
    setCompleted(snap.completed);
    if (snap.current) {
      const isNewRunningOp = snap.current.id !== lastCurrentId && snap.current.result === null;
      if (isNewRunningOp && settingsStore.settings.operations.backgroundByDefault) {
        setIsMinimized(true);
      }
      lastCurrentId = snap.current.id;
      const isScan =
        snap.current.kind === "scan" && snap.current.result === null;
      setCurrent({
        id: snap.current.id,
        jobId: snap.current.jobId,
        title: snap.current.title,
        kind: snap.current.kind,
        packageName: snap.current.packageName,
        output: snap.current.output,
        result: snap.current.result,
        currentPhase: snap.current.currentPhase ?? null,
        phaseStack: snap.current.phaseStack ?? [],
        progressFraction: snap.current.progressFraction ?? null,
        operationWarnings: snap.current.operationWarnings ?? [],
        findings: snap.current.findings ?? [],
        scanWarning: snap.current.scanWarning ?? null,
        canOverrideScan: snap.current.canOverrideScan ?? false,
        canClearCache: snap.current.canClearCache ?? false,
        isScan,
      });
    } else {
      lastCurrentId = null;
      setCurrent(null);
    }
  }

  async function hydrateFromRust() {
    try {
      const snap = await invoke<StateSnapshot>("get_operation_state");
      applySnapshot(snap);
    } catch (e) {
      console.error("Failed to hydrate operation state:", getErrorMessage(e));
    }
  }

  // --- Event listeners ---

  const unlistens: UnlistenFn[] = [];

  async function setupListeners() {
    // Full state resync (primary source of truth for queue/completed).
    unlistens.push(await listen<StateSnapshot>("operation-state-changed", (event) => {
      applySnapshot(event.payload);
    }));

    // Per-line streaming append for the current op (avoids waiting for a
    // full state resync on every line).
    unlistens.push(await listen<OperationOutput>("operation-output", (event) => {
      const op = current();
      if (!op) return;
      setCurrent({ ...op, output: [...op.output, event.payload] });
    }));

    // Result event. Rust immediately follows with a state-changed event
    // that carries the result on current, so we just fire callbacks and
    // refetch here.
    unlistens.push(await listen<OperationResult>("operation-finished", (event) => {
      const op = current();
      if (!op) return;
      if (op.isScan) return; // scan results come via virustotal-scan-finished

      if (event.payload.success) installedPackagesStore.reload();

      fireFinishCallbacks({
        id: op.id,
        title: op.title,
        kind: op.kind,
        packageName: op.packageName,
        success: event.payload.success,
        status: event.payload.status ?? (event.payload.success ? "success" : "error"),
        message: event.payload.message,
        output: op.output,
      });
    }));

    // Notification toast body-click → unminimize so the result modal is visible.
    unlistens.push(await listen("operation-restore", () => {
      setIsMinimized(false);
    }));
  }

  setupListeners();
  // Initial hydration (covers cold-start and webview recreation after tray-hide).
  hydrateFromRust();

  // --- Enqueue helpers ---

  interface EnqueueAction {
    type: string;
    [k: string]: any;
  }

  async function enqueue(action: EnqueueAction): Promise<string | null> {
    const { settings } = settingsStore;
    // Auto-minimize when backgroundByDefault is on and this is a streaming op.
    if (settings.operations.backgroundByDefault) {
      setIsMinimized(true);
    } else {
      setIsMinimized(false);
    }
    try {
      const id = await invoke<string>("enqueue_operation", { action });
      return id;
    } catch (e) {
      console.error("enqueue_operation failed:", getErrorMessage(e));
      return null;
    }
  }

  async function queueInstall(
    pkg: ScoopPackage,
    version?: string,
    onComplete?: (wasSuccess: boolean) => void,
    options?: { skipScan?: boolean },
  ): Promise<string | null> {
    const { settings } = settingsStore;
    if (onComplete) {
      onNextFinish(
        (op) => op.kind === "install" && op.packageName === pkg.name,
        onComplete,
      );
    }

    if (!options?.skipScan && settings.virustotal.enabled && settings.virustotal.autoScanOnInstall) {
      return await enqueue({
        type: "scan-and-install",
        package: pkg.name,
        bucket: pkg.source,
        version: version || null,
      });
    } else {
      return await enqueue({
        type: "install",
        package: pkg.name,
        bucket: pkg.source,
        version: version || null,
      });
    }
  }

  async function handleInstallConfirm() {
    // Rust extracts the install params from the current scan op's chain
    // and enqueues a plain install, archiving the scan op.
    const { settings } = settingsStore;
    if (settings.operations.backgroundByDefault) {
      setIsMinimized(true);
    }
    try {
      await invoke("confirm_install_anyway");
    } catch (e) {
      console.error("confirm_install_anyway failed:", getErrorMessage(e));
    }
  }

  async function queueUpdate(pkg: ScoopPackage, onComplete?: (wasSuccess: boolean) => void) {
    if (onComplete) {
      onNextFinish(
        (op) => op.kind === "update" && op.packageName === pkg.name,
        onComplete,
      );
    }
    await enqueue({ type: "update", package: pkg.name });
  }

  async function queueUpdateAll(onComplete?: (wasSuccess: boolean) => void) {
    if (onComplete) {
      onNextFinish((op) => op.kind === "update-all", onComplete);
    }
    await enqueue({ type: "update-all" });
  }

  async function queueUninstall(pkg: ScoopPackage, onComplete?: (wasSuccess: boolean) => void) {
    const { settings } = settingsStore;
    const autoClear = settings.cleanup.autoClearCacheOnUninstall;

    if (onComplete) {
      onNextFinish(
        (op) => op.kind === "uninstall" && op.packageName === pkg.name,
        onComplete,
      );
    }
    // When autoClear is false, Rust still attaches a ClearCache chain but
    // marks it deferred (auto_chain=false). The frontend sees canClearCache
    // on the finished op and renders the button — survives tray-hide.
    await enqueue({
      type: "uninstall",
      package: pkg.name,
      bucket: pkg.source,
      auto_clear_cache: autoClear,
    });
  }

  async function runPendingChain() {
    try {
      await invoke("run_pending_chain");
    } catch (e) {
      console.error("run_pending_chain failed:", getErrorMessage(e));
    }
  }

  async function queueGenericOperation(
    action: "cleanup-apps" | "cleanup-cache",
    onComplete?: (wasSuccess: boolean) => void,
  ) {
    if (onComplete) {
      onNextFinish((op) => op.kind === "cleanup", onComplete);
    }
    await enqueue({ type: action });
  }

  function close(_wasSuccess: boolean) {
    setCurrent(null);
    setIsMinimized(false);
    // Tell Rust to archive the finished op into completed history.
    invoke("dismiss_current_operation").catch(err => console.error("dismiss failed:", getErrorMessage(err)));
  }

  function dismissAll() {
    invoke("dismiss_current_operation").catch(() => {});
    invoke("clear_completed_operations").catch(err => console.error("clear_completed failed:", getErrorMessage(err)));
    if (!current()) setIsMinimized(false);
  }

  async function cancel() {
    const op = current();
    if (op?.scanWarning) {
      close(false);
      return;
    }
    if (op?.result) {
      close(op.result.success);
      return;
    }
    try {
      await invoke("cancel_current_operation");
    } catch (e) {
      console.error("cancel_current_operation failed:", getErrorMessage(e));
    }
  }

  function minimize() { setIsMinimized(true); }
  function restore() { setIsMinimized(false); }

  return {
    current,
    queue,
    completed,
    isMinimized,
    queueInstall,
    queueUpdate,
    queueUpdateAll,
    queueUninstall,
    queueGenericOperation,
    handleInstallConfirm,
    runPendingChain,
    close,
    cancel,
    minimize,
    restore,
    dismissAll,
    hydrateFromRust,
  };
}

const operationsStore = createRoot(createOperationsStore);
export default operationsStore;

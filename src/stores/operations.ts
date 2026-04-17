import { createRoot, createSignal } from "solid-js";
import { listen, emit, UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { ScoopPackage } from "../types/scoop";
import installedPackagesStore from "./installedPackagesStore";
import settingsStore from "./settings";

export interface ScanWarning {
  detectionsFound: boolean;
  isApiKeyMissing: boolean;
  message: string;
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
  title: string;
  kind: OperationKind;
  packageName?: string;
  output: OperationOutput[];
  result: OperationResult | null;
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
  output: OperationOutput[];
  message: string;
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
    title: string;
    kind: OperationKind;
    packageName?: string;
    output: OperationOutput[];
    result: OperationResult | null;
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
        try { fc.cb(op.success); } catch (e) { console.error("finish callback threw:", e); }
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
      const isScan =
        snap.current.kind === "scan" && snap.current.result === null;
      setCurrent({
        id: snap.current.id,
        title: snap.current.title,
        kind: snap.current.kind,
        packageName: snap.current.packageName,
        output: snap.current.output,
        result: snap.current.result,
        scanWarning: snap.current.scanWarning ?? null,
        canOverrideScan: snap.current.canOverrideScan ?? false,
        canClearCache: snap.current.canClearCache ?? false,
        isScan,
      });
    } else {
      setCurrent(null);
    }
  }

  async function hydrateFromRust() {
    try {
      const snap = await invoke<StateSnapshot>("get_operation_state");
      applySnapshot(snap);
    } catch (e) {
      console.error("Failed to hydrate operation state:", e);
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

      if (event.payload.success) installedPackagesStore.refetch();

      fireFinishCallbacks({
        id: op.id,
        title: op.title,
        kind: op.kind,
        packageName: op.packageName,
        success: event.payload.success,
        message: event.payload.message,
        output: op.output,
      });
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
      console.error("enqueue_operation failed:", e);
      return null;
    }
  }

  async function queueInstall(pkg: ScoopPackage, version?: string, onComplete?: (wasSuccess: boolean) => void) {
    const { settings } = settingsStore;
    if (onComplete) {
      onNextFinish(
        (op) => op.kind === "install" && op.packageName === pkg.name,
        onComplete,
      );
    }

    if (settings.virustotal.enabled && settings.virustotal.autoScanOnInstall) {
      await enqueue({
        type: "scan-and-install",
        package: pkg.name,
        bucket: pkg.source,
        version: version || null,
      });
    } else {
      await enqueue({
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
    try {
      await invoke("confirm_install_anyway");
    } catch (e) {
      console.error("confirm_install_anyway failed:", e);
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
      console.error("run_pending_chain failed:", e);
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

  function close(wasSuccess: boolean) {
    if (wasSuccess) installedPackagesStore.refetch();
    setCurrent(null);
    setIsMinimized(false);
    // Tell Rust to archive the finished op into completed history.
    invoke("dismiss_current_operation").catch(err => console.error("dismiss failed:", err));
  }

  function dismissAll() {
    invoke("dismiss_current_operation").catch(() => {});
    invoke("clear_completed_operations").catch(err => console.error("clear_completed failed:", err));
    if (!current()) setIsMinimized(false);
  }

  function cancel() {
    const op = current();
    if (op?.scanWarning) {
      close(false);
      return;
    }
    if (op?.result) {
      close(op.result.success);
      return;
    }
    // Streaming op (including running scan): tell backend to kill the child.
    emit("cancel-operation");
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

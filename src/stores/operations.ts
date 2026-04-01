import { createRoot, createSignal } from "solid-js";
import { listen, emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { VirustotalResult, ScoopPackage } from "../types/scoop";
import installedPackagesStore from "./installedPackagesStore";
import settingsStore from "./settings";

// --- Types ---

interface OperationOutput {
  line: string;
  source: string;
}

interface OperationResult {
  success: boolean;
  message: string;
}

export interface Operation {
  id: string;
  title: string;
  type: "install" | "update" | "update-all" | "uninstall" | "clear-cache" | "cleanup" | "scan" | "auto-update";
  packageName?: string;
  output: OperationOutput[];
  result: OperationResult | null;
  scanWarning: VirustotalResult | null;
  isScan: boolean;
  nextStep: { buttonLabel: string; onNext: () => void } | null;
  // Auto-chain: when the operation finishes successfully, run this next in the same modal (output continues)
  chainOnSuccess?: { title: string; invokeCmd: () => void };
  onComplete?: (wasSuccess: boolean) => void;
}

export interface CompletedOperation {
  id: string;
  title: string;
  success: boolean;
  output: OperationOutput[];
  message: string;
}

interface QueuedOperation {
  id: string;
  title: string;
  type: Operation["type"];
  packageName?: string;
  invokeCmd: () => void;
  isScan: boolean;
  nextStep: Operation["nextStep"];
  chainOnSuccess?: Operation["chainOnSuccess"];
  onComplete?: (wasSuccess: boolean) => void;
}

// --- Store ---

function createOperationsStore() {
  const [current, setCurrent] = createSignal<Operation | null>(null);
  const [queue, setQueue] = createSignal<QueuedOperation[]>([]);
  const [completed, setCompleted] = createSignal<CompletedOperation[]>([]);
  const [isMinimized, setIsMinimized] = createSignal(false);

  let nextId = 0;
  const genId = () => `op-${++nextId}`;

  // Pending VT scan → install state
  let pendingPkg: ScoopPackage | null = null;
  let pendingVersion: string | undefined = undefined;
  let pendingOnComplete: ((wasSuccess: boolean) => void) | undefined = undefined;

  // --- Global event listeners ---

  async function setupListeners() {
    await listen<OperationOutput>("operation-output", (event) => {
      if (!current()) return;
      setCurrent(prev => prev ? {
        ...prev,
        output: [...prev.output, event.payload],
      } : null);
    });

    await listen<OperationResult>("operation-finished", (event) => {
      const op = current();
      if (!op || op.isScan) return;

      // If successful and there's a chained operation, continue in the same modal
      if (event.payload.success && op.chainOnSuccess) {
        const chain = op.chainOnSuccess;
        setCurrent(prev => prev ? {
          ...prev,
          title: chain.title,
          chainOnSuccess: undefined,
          result: null,
        } : null);
        chain.invokeCmd();
        return;
      }

      // If there are queued operations, auto-advance: push to history, start next
      if (queue().length > 0 && !op.nextStep) {
        // Fire onComplete callback
        if (op.onComplete) op.onComplete(event.payload.success);
        if (event.payload.success) installedPackagesStore.refetch();

        // Push to completed history with output snapshot
        setCompleted(prev => [...prev, {
          id: op.id,
          title: op.title,
          success: event.payload.success,
          output: [...op.output],
          message: event.payload.message,
        }]);

        setCurrent(null);
        processQueue();
        return;
      }

      // If there's completed history, this was part of a batch — push to history and clear current
      if (completed().length > 0) {
        if (op.onComplete) op.onComplete(event.payload.success);
        if (event.payload.success) installedPackagesStore.refetch();

        setCompleted(prev => [...prev, {
          id: op.id,
          title: op.title,
          success: event.payload.success,
          output: [...op.output],
          message: event.payload.message,
        }]);

        setCurrent(null);
        return;
      }

      // Single operation, no history — show result normally (user must dismiss)
      setCurrent(prev => prev ? { ...prev, result: event.payload } : null);
    });

    await listen<VirustotalResult>("virustotal-scan-finished", (event) => {
      const op = current();
      if (!op || !op.isScan) return;
      if (event.payload.detections_found || event.payload.is_api_key_missing) {
        setCurrent(prev => prev ? { ...prev, scanWarning: event.payload } : null);
      } else {
        // Clean scan — proceed to install
        confirmInstallAfterScan();
      }
    });

    // Auto-update operations from backend scheduler
    await listen<string>("auto-operation-start", (event) => {
      startOperation({
        title: event.payload,
        type: "auto-update",
        isScan: false,
        nextStep: null,
        invokeCmd: () => {}, // Already running on backend
      });
    });
  }

  setupListeners();

  // --- Internal helpers ---

  function startOperation(opts: {
    title: string;
    type: Operation["type"];
    packageName?: string;
    isScan: boolean;
    nextStep: Operation["nextStep"];
    chainOnSuccess?: Operation["chainOnSuccess"];
    invokeCmd: () => void;
    onComplete?: (wasSuccess: boolean) => void;
  }) {
    const op: Operation = {
      id: genId(),
      title: opts.title,
      type: opts.type,
      packageName: opts.packageName,
      output: [],
      result: null,
      scanWarning: null,
      isScan: opts.isScan,
      nextStep: opts.nextStep,
      chainOnSuccess: opts.chainOnSuccess,
      onComplete: opts.onComplete,
    };

    // If there's a finished operation sitting around, push it to history and take over
    const existing = current();
    if (existing?.result) {
      if (existing.onComplete) existing.onComplete(existing.result.success);
      if (existing.result.success) installedPackagesStore.refetch();
      setCompleted(prev => [...prev, {
        id: existing.id,
        title: existing.title,
        success: existing.result!.success,
        output: [...existing.output],
        message: existing.result!.message,
      }]);
      setCurrent(null);
    }

    // If something is actively running, queue it
    if (current()) {
      setQueue(prev => [...prev, {
        id: op.id,
        title: opts.title,
        type: opts.type,
        packageName: opts.packageName,
        invokeCmd: opts.invokeCmd,
        isScan: opts.isScan,
        nextStep: opts.nextStep,
        chainOnSuccess: opts.chainOnSuccess,
        onComplete: opts.onComplete,
      }]);
      return;
    }

    setCurrent(op);

    // Auto-minimize if background mode is on (except for scans that need user input)
    const { settings } = settingsStore;
    if (settings.operations.backgroundByDefault && !opts.isScan) {
      setIsMinimized(true);
    } else {
      setIsMinimized(false);
    }

    opts.invokeCmd();
  }

  function processQueue() {
    const q = queue();
    if (q.length === 0) return;

    const next = q[0];
    setQueue(prev => prev.slice(1));

    setCurrent({
      id: next.id,
      title: next.title,
      type: next.type,
      packageName: next.packageName,
      output: [],
      result: null,
      scanWarning: null,
      isScan: next.isScan,
      nextStep: next.nextStep,
      chainOnSuccess: next.chainOnSuccess,
      onComplete: next.onComplete,
    });

    next.invokeCmd();
  }

  function doInstall(pkg: ScoopPackage, version?: string, onComplete?: (wasSuccess: boolean) => void) {
    const displayName = version ? `${pkg.name}@${version}` : pkg.name;
    startOperation({
      title: `Installing ${displayName}`,
      type: "install",
      packageName: pkg.name,
      isScan: false,
      nextStep: null,
      onComplete,
      invokeCmd: () => {
        invoke("install_package", {
          packageName: pkg.name,
          bucket: pkg.source,
          version: version || null,
        }).catch(err => console.error("Install invocation failed:", err));
      },
    });
  }

  function confirmInstallAfterScan() {
    const pkg = pendingPkg;
    const version = pendingVersion;
    const onComplete = pendingOnComplete;
    pendingPkg = null;
    pendingVersion = undefined;
    pendingOnComplete = undefined;

    if (pkg) {
      setCurrent(null);
      doInstall(pkg, version, onComplete);
    }
  }

  // --- Public API ---

  function queueInstall(pkg: ScoopPackage, version?: string, onComplete?: (wasSuccess: boolean) => void) {
    const { settings } = settingsStore;

    if (settings.virustotal.enabled && settings.virustotal.autoScanOnInstall) {
      pendingPkg = pkg;
      pendingVersion = version;
      pendingOnComplete = onComplete;

      startOperation({
        title: `Scanning ${pkg.name} with VirusTotal...`,
        type: "scan",
        packageName: pkg.name,
        isScan: true,
        nextStep: null,
        onComplete,
        invokeCmd: () => {
          invoke("scan_package", {
            packageName: pkg.name,
            bucket: pkg.source,
          }).catch(err => console.error("Scan invocation failed:", err));
        },
      });
    } else {
      doInstall(pkg, version, onComplete);
    }
  }

  function handleInstallConfirm() {
    confirmInstallAfterScan();
  }

  function queueUpdate(pkg: ScoopPackage, onComplete?: (wasSuccess: boolean) => void) {
    startOperation({
      title: `Updating ${pkg.name}`,
      type: "update",
      packageName: pkg.name,
      isScan: false,
      nextStep: null,
      onComplete,
      invokeCmd: () => {
        invoke("update_package", { packageName: pkg.name })
          .catch(err => console.error("Update invocation failed:", err));
      },
    });
  }

  function queueUpdateAll(onComplete?: (wasSuccess: boolean) => void) {
    startOperation({
      title: "Updating all packages",
      type: "update-all",
      isScan: false,
      nextStep: null,
      onComplete,
      invokeCmd: () => {
        invoke("update_all_packages")
          .catch(err => console.error("Update all invocation failed:", err));
      },
    });
  }

  function queueUninstall(pkg: ScoopPackage, onComplete?: (wasSuccess: boolean) => void) {
    const { settings } = settingsStore;
    const autoClear = settings.cleanup.autoClearCacheOnUninstall;

    startOperation({
      title: `Uninstalling ${pkg.name}`,
      type: "uninstall",
      packageName: pkg.name,
      isScan: false,
      // Auto-clear ON: chain cache clear into the same modal (output continues, bar stays active)
      // Auto-clear OFF: show "Clear Cache" button that requires user action
      chainOnSuccess: autoClear ? {
        title: `Clearing cache for ${pkg.name}`,
        invokeCmd: () => {
          invoke("clear_package_cache", {
            packageName: pkg.name,
            bucket: pkg.source,
          }).catch(err => console.error("Clear cache invocation failed:", err));
        },
      } : undefined,
      nextStep: autoClear ? null : {
        buttonLabel: "Clear Cache",
        onNext: () => {
          setCurrent(null);
          startOperation({
            title: `Clearing cache for ${pkg.name}`,
            type: "clear-cache",
            packageName: pkg.name,
            isScan: false,
            nextStep: null,
            onComplete,
            invokeCmd: () => {
              invoke("clear_package_cache", {
                packageName: pkg.name,
                bucket: pkg.source,
              }).catch(err => console.error("Clear cache invocation failed:", err));
            },
          });
        },
      },
      onComplete,
      invokeCmd: () => {
        invoke("uninstall_package", {
          packageName: pkg.name,
          bucket: pkg.source,
        }).catch(err => console.error("Uninstall invocation failed:", err));
      },
    });
  }

  function queueGenericOperation(title: string, invokeCmd: () => void, onComplete?: (wasSuccess: boolean) => void) {
    startOperation({
      title,
      type: "cleanup",
      isScan: false,
      nextStep: null,
      onComplete,
      invokeCmd,
    });
  }

  function close(wasSuccess: boolean) {
    const op = current();
    if (op?.onComplete) {
      op.onComplete(wasSuccess);
    }
    if (wasSuccess) {
      installedPackagesStore.refetch();
    }
    setCurrent(null);
    setIsMinimized(false);
    pendingPkg = null;
    pendingVersion = undefined;
    pendingOnComplete = undefined;

    // If there's more in the queue, keep going
    if (queue().length > 0) {
      processQueue();
    }
  }

  function dismissAll() {
    setCompleted([]);
    if (!current()) {
      setIsMinimized(false);
    }
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
    emit("cancel-operation");
  }

  function minimize() {
    setIsMinimized(true);
  }

  function restore() {
    setIsMinimized(false);
  }

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
    close,
    cancel,
    minimize,
    restore,
    dismissAll,
  };
}

const operationsStore = createRoot(createOperationsStore);
export default operationsStore;

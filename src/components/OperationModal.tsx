import { For, Show, createEffect, Component } from "solid-js";
import { ExternalLink, CircleCheck, CircleX, ShieldAlert, TriangleAlert, Info } from "lucide-solid";
import operationsStore from "../stores/operations";
import Modal from "./common/Modal";
import { useI18n } from "../i18n";

/// Format a raw phase hint like "updating_buckets" into a user-facing
/// "Updating buckets…". Keeps display logic colocated with the consumer.
const formatPhase = (hint: string): string => {
  const words = hint.replace(/_/g, " ").split(" ").filter(Boolean);
  if (words.length === 0) return "";
  const head = words[0].charAt(0).toUpperCase() + words[0].slice(1);
  return [head, ...words.slice(1)].join(" ") + "…";
};

const LineWithLinks: Component<{ line: string }> = (props) => {
  const ansiRegex = /[\u001b\u009b][[()#;?]*.{0,2}(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
  const cleanLine = props.line.replace(ansiRegex, '');
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = cleanLine.split(urlRegex);

  return (
    <span>
      <For each={parts}>
        {(part) => {
          if (part.match(urlRegex)) {
            return (
              <a href={part} target="_blank" class="link link-info inline-flex items-center">
                {part}
                <ExternalLink class="w-3 h-3 ms-1" />
              </a>
            );
          }
          return <span>{part}</span>;
        }}
      </For>
    </span>
  );
};

function OperationModal() {
  const { t } = useI18n();
  let scrollRef: HTMLDivElement | undefined;

  const op = () => operationsStore.current();
  const isOpen = () => !!op() && !operationsStore.isMinimized();
  const isRunning = () => {
    const o = op();
    return o ? !o.result && !o.scanWarning : false;
  };

  // Auto-scroll on new output
  createEffect(() => {
    const o = op();
    if (o) o.output.length; // track
    if (scrollRef) {
      requestAnimationFrame(() => {
        scrollRef!.scrollTop = scrollRef!.scrollHeight;
      });
    }
  });

  const handleClose = () => {
    const o = op();
    if (!o) return;

    if (o.scanWarning) {
      // Minimize so the user can restore the modal and use "Install Anyway".
      // The footer "Close" button still dismisses explicitly.
      operationsStore.minimize();
    } else if (o.result) {
      operationsStore.close(o.result.success);
    } else {
      // Running — minimize to background instead of canceling
      operationsStore.minimize();
    }
  };

  const handleNextStep = () => {
    operationsStore.runPendingChain();
  };

  return (
    <Modal
      isOpen={isOpen()}
      onClose={handleClose}
      title={op()?.title || ""}
      size="large"
      preventBackdropClose={false}
      footer={
        <div class="flex items-center w-full">
          {/* Left: status */}
          <div class="flex-1 min-w-0">
            <Show when={isRunning()}>
              <span class="flex items-center gap-2 text-sm text-base-content/50">
                <span class="loading loading-spinner loading-xs"></span>
                <Show
                  when={(op()?.phaseStack.length ?? 0) > 0}
                  fallback={
                    <Show when={op()?.currentPhase} fallback={t("operation.running")}>
                      {formatPhase(op()!.currentPhase!)}
                    </Show>
                  }
                >
                  <span class="truncate">{op()!.phaseStack.join(" › ")}</span>
                </Show>
              </span>
            </Show>
            <Show when={op()?.result?.success && !op()?.scanWarning}>
              <span class="flex items-center gap-2 text-sm" classList={{ "text-success": op()?.result?.status !== "warning", "text-warning": op()?.result?.status === "warning" }}>
                <Show when={op()?.result?.status === "warning"} fallback={<CircleCheck class="w-4 h-4 shrink-0" />}>
                  <TriangleAlert class="w-4 h-4 shrink-0" />
                </Show>
                <span class="truncate">{op()!.result!.message}</span>
              </span>
            </Show>
            <Show when={op()?.result && !op()?.result?.success && !op()?.scanWarning}>
              <span class="flex items-center gap-2 text-sm text-error">
                <CircleX class="w-4 h-4 shrink-0" />
                <span class="truncate">{op()!.result!.message}</span>
              </span>
            </Show>
            <Show when={op()?.scanWarning}>
              <span class="flex items-center gap-2 text-sm text-warning">
                <ShieldAlert class="w-4 h-4 shrink-0" />
                <span class="truncate">{op()!.scanWarning!.message}</span>
              </span>
            </Show>
          </div>

          {/* Right: actions */}
          <div class="flex items-center gap-2 shrink-0">
            <Show when={isRunning()}>
              <button class="btn btn-sm btn-ghost text-base-content/50" onClick={() => operationsStore.minimize()}>
                {t("operation.background")}
              </button>
            </Show>
            <Show when={op()?.scanWarning}>
              <button class="btn btn-sm btn-ghost text-warning" onClick={() => operationsStore.handleInstallConfirm()}>
                <TriangleAlert class="w-3.5 h-3.5" />
                {t("operation.installAnyway")}
              </button>
            </Show>
            <Show when={op()?.canClearCache}>
              <button class="btn btn-sm btn-primary" onClick={handleNextStep}>
                Clear Cache
              </button>
            </Show>
            <Show when={isRunning()}>
              <button class="btn btn-sm" onClick={() => operationsStore.cancel()}>
                {t("common.cancel")}
              </button>
            </Show>
            <Show when={!op()?.scanWarning && op()?.result}>
              <button class="btn btn-sm" onClick={() => operationsStore.close(op()!.result!.success)}>
                {t("common.dismiss")}
              </button>
            </Show>
            <Show when={op()?.scanWarning}>
              <button class="btn btn-sm" onClick={() => operationsStore.cancel()}>
                {t("common.cancel")}
              </button>
            </Show>
          </div>
        </div>
      }
    >
      <Show when={(op()?.operationWarnings.length ?? 0) > 0}>
        <div class="mb-3 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm space-y-1">
          <div class="flex items-center gap-2 text-warning font-medium">
            <TriangleAlert class="w-4 h-4 shrink-0" />
            <span>
              {op()!.operationWarnings.length === 1
                ? t("operation.warningsOne")
                : t("operation.warningsMany", { count: String(op()!.operationWarnings.length) })}
            </span>
          </div>
          <ul class="ms-6 list-disc text-base-content/80">
            <For each={op()?.operationWarnings ?? []}>
              {(w) => <li>{w.message}</li>}
            </For>
          </ul>
        </div>
      </Show>
      <Show when={(op()?.findings.length ?? 0) > 0}>
        <div class="mb-3 rounded-lg border border-info/40 bg-info/5 p-3 text-sm space-y-2">
          <div class="flex items-center gap-2 text-info font-medium">
            <Info class="w-4 h-4 shrink-0" />
            <span>
              {op()!.findings.length === 1
                ? t("operation.findingsOne")
                : t("operation.findingsMany", { count: String(op()!.findings.length) })}
            </span>
          </div>
          <For each={op()?.findings ?? []}>
            {(f) => (
              <div class="ms-6 whitespace-pre-wrap text-base-content/80">
                {f.message}
              </div>
            )}
          </For>
        </div>
      </Show>
      <div
        ref={scrollRef}
        class="bg-base-100 font-mono text-sm p-4 rounded-lg max-h-96 overflow-y-auto border border-base-content/5"
      >
        <Show when={op()?.output.length === 0 && isRunning()}>
          <span class="text-base-content/30">{t("operation.waitingForOutput")}</span>
        </Show>
        <For each={op()?.output ?? []}>
          {(line) => (
            <p class="text-base-content/80">
              <LineWithLinks line={line.line} />
            </p>
          )}
        </For>
      </div>
    </Modal>
  );
}

export default OperationModal;

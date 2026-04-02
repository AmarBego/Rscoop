import { For, Show, createEffect, Component } from "solid-js";
import { ExternalLink, CircleCheck, CircleX, ShieldAlert, TriangleAlert } from "lucide-solid";
import operationsStore from "../stores/operations";
import Modal from "./common/Modal";
import { useI18n } from "../i18n";

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
                <ExternalLink class="w-3 h-3 ml-1" />
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

    if (o.result) {
      operationsStore.close(o.result.success);
    } else if (o.scanWarning) {
      operationsStore.close(false);
    } else {
      // Running — minimize to background instead of canceling
      operationsStore.minimize();
    }
  };

  const handleNextStep = () => {
    const o = op();
    if (o?.nextStep) {
      o.nextStep.onNext();
    }
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
                {t("operation.running")}
              </span>
            </Show>
            <Show when={op()?.result?.success}>
              <span class="flex items-center gap-2 text-sm text-success">
                <CircleCheck class="w-4 h-4 shrink-0" />
                <span class="truncate">{op()!.result!.message}</span>
              </span>
            </Show>
            <Show when={op()?.result && !op()?.result?.success}>
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
            <Show when={op()?.result?.success && op()?.nextStep}>
              <button class="btn btn-sm btn-primary" onClick={handleNextStep}>
                {op()!.nextStep!.buttonLabel}
              </button>
            </Show>
            <Show when={isRunning()}>
              <button class="btn btn-sm" onClick={() => operationsStore.cancel()}>
                {t("common.cancel")}
              </button>
            </Show>
            <Show when={op()?.result}>
              <button class="btn btn-sm" onClick={() => operationsStore.close(op()!.result!.success)}>
                {t("common.dismiss")}
              </button>
            </Show>
            <Show when={op()?.scanWarning && !op()?.result}>
              <button class="btn btn-sm" onClick={() => operationsStore.close(false)}>
                {t("common.close")}
              </button>
            </Show>
          </div>
        </div>
      }
    >
      <div
        ref={scrollRef}
        class="bg-base-100 font-mono text-sm p-4 rounded-lg max-h-96 overflow-y-auto border border-base-content/5"
      >
        <Show when={op()?.output.length === 0 && isRunning()}>
          <span class="text-base-content/30">{t("operation.waitingForOutput")}</span>
        </Show>
        <For each={op()?.output ?? []}>
          {(line) => (
            <p classList={{ "text-red-400": line.source === "stderr" }}>
              <LineWithLinks line={line.line} />
            </p>
          )}
        </For>
      </div>
    </Modal>
  );
}

export default OperationModal;

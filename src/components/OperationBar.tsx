import { Show, For, createSignal } from "solid-js";
import { Maximize2, ShieldAlert, CircleCheck, CircleX } from "lucide-solid";
import operationsStore, { CompletedOperation } from "../stores/operations";
import Modal from "./common/Modal";
import { useI18n } from "../i18n";

// Reuse the line renderer from OperationModal
const LineWithLinks = (props: { line: string }) => {
  const ansiRegex = /[\u001b\u009b][[()#;?]*.{0,2}(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
  const cleanLine = props.line.replace(ansiRegex, '');
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = cleanLine.split(urlRegex);
  return (
    <span>
      <For each={parts}>
        {(part) => part.match(urlRegex)
          ? <a href={part} target="_blank" class="link link-info">{part}</a>
          : <span>{part}</span>
        }
      </For>
    </span>
  );
};

function OperationBar() {
  const { t } = useI18n();
  const op = () => operationsStore.current();
  const hasCompleted = () => operationsStore.completed().length > 0;
  const isVisible = () => (!!op() && operationsStore.isMinimized()) || hasCompleted();
  const isRunning = () => {
    const o = op();
    return o ? !o.result && !o.scanWarning : false;
  };
  const isDone = () => !!op()?.result;
  const isSuccess = () => op()?.result?.success ?? false;
  const needsAttention = () => !!op()?.scanWarning || !!op()?.canClearCache;

  const [viewingLog, setViewingLog] = createSignal<CompletedOperation | null>(null);

  const formatTitle = (title: string, success: boolean) => {
    if (!success) return t("operationbar.failed", { title });
    return title
      .replace(/^Installing (.+)/, (_, name) => t("operationbar.installed", { name }))
      .replace(/^Uninstalling (.+)/, (_, name) => t("operationbar.uninstalled", { name }))
      .replace(/^Updating (.+)/, (_, name) => t("operationbar.updated", { name }))
      .replace(/^Clearing cache for (.+)/, (_, name) => t("operationbar.clearedCache", { name }))
      .replace(/^Cleaning up (.+)/, (_, name) => t("operationbar.cleanedUp", { name }));
  };

  const successCount = () => operationsStore.completed().filter(c => c.success).length;
  const failCount = () => operationsStore.completed().filter(c => !c.success).length;

  const barText = () => {
    const c = operationsStore.completed();

    if (needsAttention()) return t("operationbar.actionRequired");
    if (isRunning()) return op()?.title;

    // Single completed op still in current (no batch history)
    if (isDone()) return formatTitle(op()!.title, isSuccess());

    // Batch finished — all in history, no current
    if (c.length > 0) {
      const s = successCount();
      const f = failCount();
      if (c.length === 1) return formatTitle(c[0].title, c[0].success);
      return f > 0
        ? t("operationbar.allCompletedWithFails", { success: String(s), failed: String(f) })
        : t("operationbar.allCompleted", { success: String(s) });
    }

    return "";
  };

  return (
    <>
      <Show when={isVisible()}>
        <div
          class="fixed bottom-0 left-0 right-0 z-50 cursor-pointer group"
          onClick={() => {
            if (op()) operationsStore.restore();
          }}
        >
          {/* Progress indicator */}
          <Show when={isRunning()}>
            <div class="h-0.5 w-full bg-base-300 overflow-hidden">
              <div class="h-full w-1/3 bg-primary animate-slide-lr" />
            </div>
          </Show>
          <Show when={isDone() && !needsAttention()}>
            <div class="h-0.5 w-full" classList={{ "bg-success": isSuccess(), "bg-error": !isSuccess() }} />
          </Show>
          <Show when={needsAttention()}>
            <div class="h-0.5 w-full bg-warning animate-pulse" />
          </Show>
          <Show when={!op() && hasCompleted()}>
            <div class="h-0.5 w-full" classList={{ "bg-success": failCount() === 0, "bg-warning": failCount() > 0 }} />
          </Show>

          {/* Content */}
          <div class="bg-base-300 border-t border-base-content/10 px-4 py-2 flex items-center justify-between">
            <div class="flex items-center gap-3 min-w-0">
              <Show when={isRunning()}>
                <span class="loading loading-spinner loading-xs shrink-0"></span>
              </Show>
              <Show when={needsAttention()}>
                <ShieldAlert class="w-4 h-4 text-warning shrink-0 animate-pulse" />
              </Show>
              <Show when={!isRunning() && !needsAttention() && (isDone() || hasCompleted())}>
                <Show when={failCount() === 0} fallback={<CircleX class="w-4 h-4 text-error shrink-0" />}>
                  <CircleCheck class="w-4 h-4 text-success shrink-0" />
                </Show>
              </Show>
              <span class="text-sm truncate">{barText()}</span>
              <Show when={operationsStore.queue().length > 0}>
                <span class="text-xs text-base-content/40">{t("operationbar.queued", { count: String(operationsStore.queue().length) })}</span>
              </Show>
            </div>

            <div class="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <Show when={!isRunning()}>
                <button
                  class="btn btn-xs btn-ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (op()) operationsStore.close(isSuccess());
                    operationsStore.dismissAll();
                  }}
                >
                  {t("common.dismiss")}
                </button>
              </Show>
              <Show when={op()}>
                <Maximize2 class="w-3.5 h-3.5 text-base-content/40" />
              </Show>
            </div>
          </div>

          {/* Hover panel */}
          <Show when={hasCompleted() || operationsStore.queue().length > 0}>
            <div
              class="absolute bottom-full left-0 right-0 bg-base-300 border-t border-base-content/10 px-4 py-2 opacity-0 group-hover:opacity-100 transition-opacity space-y-2"
              style={{ "pointer-events": "auto" }}
            >
              <Show when={hasCompleted()}>
                <div>
                  <p class="text-xs text-base-content/40 mb-1">{t("operationbar.completed")}</p>
                  <For each={operationsStore.completed()}>
                    {(item) => (
                      <div
                        class="flex items-center gap-2 text-xs py-0.5 hover:text-base-content cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewingLog(item);
                        }}
                      >
                        <Show when={item.success} fallback={<CircleX class="w-3 h-3 text-error shrink-0" />}>
                          <CircleCheck class="w-3 h-3 text-success shrink-0" />
                        </Show>
                        <span class="truncate text-base-content/60">{formatTitle(item.title, item.success)}</span>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
              <Show when={operationsStore.queue().length > 0}>
                <div>
                  <p class="text-xs text-base-content/40 mb-1">{t("operationbar.upNext")}</p>
                  <For each={operationsStore.queue().slice(0, 3)}>
                    {(item) => (
                      <p class="text-xs text-base-content/60 truncate">{item.title}</p>
                    )}
                  </For>
                  <Show when={operationsStore.queue().length > 3}>
                    <p class="text-xs text-base-content/40">{t("operationbar.andMore", { count: String(operationsStore.queue().length - 3) })}</p>
                  </Show>
                </div>
              </Show>
            </div>
          </Show>
        </div>
      </Show>

      {/* Log viewer modal for completed operations */}
      <Modal
        isOpen={!!viewingLog()}
        onClose={() => setViewingLog(null)}
        title={viewingLog() ? formatTitle(viewingLog()!.title, viewingLog()!.success) : ""}
        size="large"
        footer={
          <div class="flex items-center w-full">
            <span class="flex-1 text-sm" classList={{ "text-success": viewingLog()?.success, "text-error": !viewingLog()?.success }}>
              {viewingLog()?.message}
            </span>
            <button class="btn btn-sm" onClick={() => setViewingLog(null)}>{t("common.close")}</button>
          </div>
        }
      >
        <div class="bg-base-100 font-mono text-sm p-4 rounded-lg max-h-96 overflow-y-auto border border-base-content/5">
          <For each={viewingLog()?.output ?? []}>
            {(line) => (
              <p classList={{ "text-red-400": line.source === "stderr" }}>
                <LineWithLinks line={line.line} />
              </p>
            )}
          </For>
          <Show when={(viewingLog()?.output?.length ?? 0) === 0}>
            <span class="text-base-content/30">{t("operationbar.noOutput")}</span>
          </Show>
        </div>
      </Modal>
    </>
  );
}

export default OperationBar;

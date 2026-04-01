import { createSignal, createEffect, onCleanup, For, Show, Component } from "solid-js";
import { listen, emit } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { VirustotalResult } from "../types/scoop";
import { ShieldAlert, TriangleAlert, ExternalLink, CircleCheck, CircleX } from "lucide-solid";
import Modal from "./common/Modal";

interface OperationOutput {
  line: string;
  source: string;
  message: string;
}

interface OperationResult {
  success: boolean;
  message: string;
}

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

interface OperationModalProps {
  title: string | null;
  onClose: (wasSuccess: boolean) => void;
  nextStep?: {
    buttonLabel: string;
    onNext: () => void;
  };
  isScan?: boolean;
  onInstallConfirm?: () => void;
}

function OperationModal(props: OperationModalProps) {
  const [output, setOutput] = createSignal<OperationOutput[]>([]);
  const [result, setResult] = createSignal<OperationResult | null>(null);
  const [showNextStep, setShowNextStep] = createSignal(false);
  const [scanWarning, setScanWarning] = createSignal<VirustotalResult | null>(null);
  let scrollRef: HTMLDivElement | undefined;

  createEffect(() => {
    let outputListener: UnlistenFn | undefined;
    let standardResultListener: UnlistenFn | undefined;
    let vtResultListener: UnlistenFn | undefined;

    const setupListeners = async () => {
      outputListener = await listen<OperationOutput>("operation-output", (event) => {
        setOutput(prev => [...prev, event.payload]);
      });

      if (props.isScan) {
        vtResultListener = await listen<VirustotalResult>("virustotal-scan-finished", (event) => {
          if (event.payload.detections_found || event.payload.is_api_key_missing) {
            setScanWarning(event.payload);
          } else {
            props.onInstallConfirm?.();
          }
        });
      } else {
        standardResultListener = await listen<OperationResult>("operation-finished", (event) => {
          setResult(event.payload);
          if (event.payload.success && props.nextStep) {
            setShowNextStep(true);
          }
        });
      }
    };

    if (props.title) {
      setOutput([]);
      setResult(null);
      setShowNextStep(false);
      setScanWarning(null);
      setupListeners();
    }

    onCleanup(() => {
      outputListener?.();
      standardResultListener?.();
      vtResultListener?.();
    });
  });

  createEffect(() => {
    output(); // track output changes
    if (scrollRef) {
      requestAnimationFrame(() => {
        scrollRef!.scrollTop = scrollRef!.scrollHeight;
      });
    }
  });

  const isRunning = () => !result() && !scanWarning();

  const handleCloseOrCancel = () => {
    if (scanWarning()) {
      props.onClose(false);
      return;
    }
    if (result()) {
      props.onClose(result()?.success ?? false);
    } else {
      emit('cancel-operation');
    }
  };

  const handleInstallAnyway = () => {
    props.onInstallConfirm?.();
  };

  const handleNextStepClick = () => {
    if (props.nextStep) {
      props.nextStep.onNext();
    }
  };

  return (
    <Modal
      isOpen={!!props.title}
      onClose={handleCloseOrCancel}
      title={props.title || ""}
      size="large"
      preventBackdropClose={isRunning()}
      footer={
        <div class="flex items-center w-full">
          {/* Left side — status */}
          <div class="flex-1">
            <Show when={isRunning()}>
              <span class="flex items-center gap-2 text-sm text-base-content/50">
                <span class="loading loading-spinner loading-xs"></span>
                Running...
              </span>
            </Show>
            <Show when={result()?.success}>
              <span class="flex items-center gap-2 text-sm text-success">
                <CircleCheck class="w-4 h-4" />
                {result()!.message}
              </span>
            </Show>
            <Show when={result() && !result()?.success}>
              <span class="flex items-center gap-2 text-sm text-error">
                <CircleX class="w-4 h-4" />
                {result()!.message}
              </span>
            </Show>
            <Show when={scanWarning()}>
              <span class="flex items-center gap-2 text-sm text-warning">
                <ShieldAlert class="w-4 h-4" />
                {scanWarning()!.message}
              </span>
            </Show>
          </div>

          {/* Right side — actions */}
          <div class="flex items-center gap-2">
            <Show when={scanWarning()}>
              <button class="btn btn-sm btn-ghost text-warning" onClick={handleInstallAnyway}>
                <TriangleAlert class="w-3.5 h-3.5" />
                Install Anyway
              </button>
            </Show>
            <Show when={showNextStep()}>
              <button class="btn btn-sm btn-primary" onClick={handleNextStepClick}>
                {props.nextStep?.buttonLabel}
              </button>
            </Show>
            <button class="btn btn-sm" onClick={handleCloseOrCancel}>
              {isRunning() ? 'Cancel' : 'Close'}
            </button>
          </div>
        </div>
      }
    >
      {/* Output area */}
      <div
        ref={scrollRef}
        class="bg-base-100 font-mono text-sm p-4 rounded-lg max-h-96 overflow-y-auto border border-base-content/5"
      >
        <Show when={output().length === 0 && isRunning()}>
          <span class="text-base-content/30">Waiting for output...</span>
        </Show>
        <For each={output()}>
          {(line) => (
            <p classList={{ 'text-red-400': line.source === 'stderr' }}>
              <LineWithLinks line={line.line} />
            </p>
          )}
        </For>
      </div>
    </Modal>
  );
}

export default OperationModal;

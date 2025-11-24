import { createEffect, Show, createSignal } from "solid-js";
import hljs from 'highlight.js/lib/core';
import json from 'highlight.js/lib/languages/json';
import { Copy, Check } from "lucide-solid";
import Modal from "./common/Modal";
import settingsStore from "../stores/settings";

hljs.registerLanguage('json', json);

interface ManifestModalProps {
  manifestContent: string | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  packageName: string;
}

function ManifestModal(props: ManifestModalProps) {
  let codeRef: HTMLElement | undefined;
  const [copied, setCopied] = createSignal(false);
  const { settings } = settingsStore;

  // Theme-specific colors
  const isDark = () => settings.theme === 'dark';
  const codeBgColor = () => isDark() ? '#282c34' : '#f0f4f9';
  const buttonTextColor = () => isDark() ? 'text-white/70 hover:text-white' : 'text-base-content/70 hover:text-base-content';
  const buttonBgHover = () => isDark() ? 'hover:bg-white/10' : 'hover:bg-base-content/10';

  createEffect(() => {
    if (props.manifestContent && codeRef) {
      codeRef.textContent = props.manifestContent;
      // Remove existing hljs classes to allow re-highlighting
      codeRef.className = 'language-json font-mono text-sm leading-relaxed !bg-transparent';
      hljs.highlightElement(codeRef);
    }
  });

  const handleCopy = async () => {
    if (props.manifestContent) {
      await navigator.clipboard.writeText(props.manifestContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isOpen = () => props.loading || !!props.error || !!props.manifestContent;

  return (
    <Modal
      isOpen={isOpen()}
      onClose={props.onClose}
      title={
        <>
          Manifest: <span class="text-info font-mono">{props.packageName}</span>
        </>
      }
      size="large"
      class="bg-base-100"
      footer={
        <button class="btn-close-outline" onClick={props.onClose}>Close</button>
      }
    >
      <Show when={props.loading}>
        <div class="flex flex-col justify-center items-center h-64 gap-4">
          <span class="loading loading-spinner loading-lg text-primary"></span>
          <span class="text-base-content/60">Loading manifest...</span>
        </div>
      </Show>

      <Show when={props.error}>
        <div role="alert" class="alert alert-error shadow-lg">
          <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span>{props.error}</span>
        </div>
      </Show>

      <Show when={props.manifestContent}>
        <div
          class="relative rounded-xl overflow-hidden border border-base-content/10 shadow-inner group"
          style={{ "background-color": codeBgColor() }}
        >
          <div class="absolute right-2 top-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <button
              class={`btn btn-sm btn-square btn-ghost ${buttonTextColor()} ${buttonBgHover()}`}
              onClick={handleCopy}
              title="Copy to clipboard"
            >
              <Show when={copied()} fallback={<Copy class="w-4 h-4" />}>
                <Check class="w-4 h-4 text-success" />
              </Show>
            </button>
          </div>
          <div class="max-h-[65vh] overflow-y-auto custom-scrollbar">
            <pre class="p-4 m-0"><code ref={codeRef} class="language-json font-mono text-sm leading-relaxed !bg-transparent"></code></pre>
          </div>
        </div>
      </Show>
    </Modal>
  );
}

export default ManifestModal;
import { createEffect, Show, createSignal } from "solid-js";
import hljs from 'highlight.js/lib/core';
import 'highlight.js/styles/atom-one-dark.css';
import json from 'highlight.js/lib/languages/json';
import { Copy, Check, X } from "lucide-solid";

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

  createEffect(() => {
    if (props.manifestContent && codeRef) {
      codeRef.textContent = props.manifestContent;
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
    <Show when={isOpen()}>
      <div class="modal modal-open backdrop-blur-sm" role="dialog" data-no-close-search>
        <div class="modal-box w-11/12 max-w-5xl bg-base-100 shadow-2xl border border-base-300 p-0 overflow-hidden">
          {/* Header */}
          <div class="flex justify-between items-center p-4 border-b border-base-200 bg-base-200/50">
            <h3 class="font-bold text-lg flex items-center gap-2">
              Manifest: <span class="text-info font-mono">{props.packageName}</span>
            </h3>
            <button class="btn btn-sm btn-circle btn-ghost" onClick={props.onClose}>
              <X class="w-5 h-5" />
            </button>
          </div>

          <div class="p-6">
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
              <div class="relative rounded-xl overflow-hidden border border-base-content/10 shadow-inner bg-[#282c34] group">
                <div class="absolute right-2 top-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <button
                    class="btn btn-sm btn-square btn-ghost text-white/70 hover:text-white hover:bg-white/10"
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
          </div>

          <div class="modal-action p-4 pt-0 mt-0">
            <button class="btn" onClick={props.onClose}>Close</button>
          </div>
        </div>
        <div class="modal-backdrop" onClick={props.onClose}></div>
      </div>
    </Show>
  );
}

export default ManifestModal; 
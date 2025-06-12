import { createEffect, Show } from "solid-js";
import hljs from 'highlight.js/lib/core';
import 'highlight.js/styles/github-dark.css';
import json from 'highlight.js/lib/languages/json';

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

  createEffect(() => {
    if (props.manifestContent && codeRef) {
      codeRef.textContent = props.manifestContent;
      hljs.highlightElement(codeRef);
    }
  });

  const isOpen = () => props.loading || !!props.error || !!props.manifestContent;

  return (
    <dialog class="modal" open={isOpen()} data-no-close-search>
      <div class="modal-box max-w-5xl bg-base-200">
        <h3 class="font-bold text-lg">Manifest for {props.packageName}</h3>
        
        <Show when={props.loading}>
            <div class="flex justify-center items-center h-64">
                <span class="loading loading-spinner loading-lg"></span>
            </div>
        </Show>

        <Show when={props.error}>
            <div role="alert" class="alert alert-error">
                <span>{props.error}</span>
            </div>
        </Show>

        <Show when={props.manifestContent}>
            <div class="bg-base-200 text-sm p-4 rounded-lg my-4 max-h-[70vh] overflow-y-auto">
                <pre><code ref={codeRef} class="language-json whitespace-pre-wrap"></code></pre>
            </div>
        </Show>

        <div class="modal-action">
          <form method="dialog">
            <button class="btn" onClick={props.onClose}>Close</button>
          </form>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button onClick={props.onClose}>close</button>
      </form>
    </dialog>
  );
}

export default ManifestModal; 
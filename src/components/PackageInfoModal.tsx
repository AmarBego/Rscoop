import { For, Show, createEffect } from "solid-js";
import { ScoopPackage, ScoopInfo } from "../types/scoop";
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';

hljs.registerLanguage('bash', bash);

interface PackageInfoModalProps {
  pkg: ScoopPackage | null;
  info: ScoopInfo | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}

function PackageInfoModal(props: PackageInfoModalProps) {
  let codeRef: HTMLElement | undefined;

  createEffect(() => {
    if (props.info?.notes && codeRef) {
      hljs.highlightElement(codeRef);
    }
  });

  return (
    <Show when={props.pkg}>
      <div 
        class="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50"
        onClick={props.onClose}
      >
        <div 
          class="bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-50 rounded-lg shadow-2xl w-full max-w-4xl m-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div class="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 class="text-xl font-semibold">{props.pkg?.name} Information</h3>
            <button 
              class="text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-sm w-8 h-8 inline-flex justify-center items-center"
              onClick={props.onClose}
            >
              <svg class="w-3 h-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 14">
                <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6"/>
              </svg>
              <span class="sr-only">Close modal</span>
            </button>
          </div>
          <div class="p-4 space-y-4">
            <Show when={props.loading}>
              <div class="flex justify-center items-center h-40">
                <div class="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500"></div>
              </div>
            </Show>
            <Show when={props.error}>
              <div class="text-red-500 bg-red-100 dark:bg-red-900/20 p-4 rounded-md">
                <p>{props.error}</p>
              </div>
            </Show>
            <Show when={props.info}>
              <div class="flex flex-col md:flex-row gap-6">
                <div class="flex-1">
                  <h4 class="text-lg font-medium mb-3 text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-gray-700 pb-2">Details</h4>
                  <div class="grid grid-cols-1 gap-x-4 gap-y-2 text-sm">
                    <For each={props.info?.details}>
                      {([key, value]) => (
                        <div class="grid grid-cols-3 gap-2 py-1 border-b border-gray-100 dark:border-gray-700/50">
                          <div class="font-semibold text-gray-500 dark:text-gray-400 capitalize col-span-1">{key.replace(/([A-Z])/g, ' $1')}:</div>
                          <div class="text-gray-800 dark:text-gray-200 col-span-2">{value}</div>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
                <Show when={props.info?.notes}>
                  <div class="flex-1">
                    <h4 class="text-lg font-medium mb-3 text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-gray-700 pb-2">Notes</h4>
                    <pre class="text-sm bg-gray-900/50 p-3 rounded-md whitespace-pre-wrap font-sans">
                      <code ref={codeRef} class="language-bash">{props.info?.notes}</code>
                    </pre>
                  </div>
                </Show>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
}

export default PackageInfoModal; 
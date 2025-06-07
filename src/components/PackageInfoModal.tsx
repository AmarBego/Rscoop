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
        class="fixed inset-0 bg-black/50 backdrop-blur-lg flex items-center justify-center z-50 overflow-auto"
        onClick={props.onClose}
      >
        <div 
          class="bg-[#2A2A2A] text-[#EDEDED] rounded-xl shadow-2xl w-full max-w-4xl m-4 max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div class="flex justify-between items-center p-4 border-b border-[#4B4B4B]">
            <h3 class="text-xl font-semibold text-[#f9f9f9]">Information</h3>
            <button 
              class="w-8 h-8 inline-flex justify-center items-center"
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
                <div class="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-[#3B82F6]"></div>
              </div>
            </Show>
            <Show when={props.error}>
              <div class="text-[#EF4444] bg-[#EF4444]/20 p-4 rounded-xl">
                <p>{props.error}</p>
              </div>
            </Show>
            <Show when={props.info}>
              <div class="flex flex-col md:flex-row gap-6">
                <div class="flex-1">
                  <h4 class="text-lg font-medium mb-3 text-[#f9f9f9] border-b border-[#4B4B4B] pb-2">Details</h4>
                  <div class="grid grid-cols-1 gap-x-4 gap-y-2 text-sm">
                    <For each={props.info?.details}>
                      {([key, value]) => (
                        <div class="grid grid-cols-3 gap-2 py-1 border-b border-[#4B4B4B]/50">
                          <div class="font-semibold text-[#A1A1AA] capitalize col-span-1">{key.replace(/([A-Z])/g, ' $1')}:</div>
                          <div class="text-[#EDEDED] col-span-2">{value}</div>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
                <Show when={props.info?.notes}>
                  <div class="flex-1">
                    <h4 class="text-lg font-medium mb-3 text-[#3B82F6] border-b border-[#4B4B4B] pb-2">Notes</h4>
                    <pre class="text-sm bg-[#3A3A3A]/50 p-3 rounded-xl whitespace-pre-wrap font-sans">
                      <code ref={codeRef} class="language-bash">{props.info?.notes}</code>
                    </pre>
                  </div>
                </Show>
              </div>
            </Show>
          </div>
          <Show when={props.pkg}>
            <div class="p-4 border-t border-[#4B4B4B] flex justify-end">
              <Show when={!props.pkg?.is_installed}>
                <button class="px-4 py-2 bg-[#3B82F6] text-[#EDEDED] rounded-xl hover:bg-[#60A5FA] transition-all duration-200 mr-2">Install</button>
              </Show>
              <Show when={props.pkg?.is_installed}>
                <button class="px-4 py-2 bg-[#e02e2a] text-[#EDEDED] rounded-xl hover:bg-[#e02e2a]/80 transition-all duration-200 mr-2">Uninstall</button>
              </Show>
              <button class="px-4 py-2 bg-[#3A3A3A] text-[#EDEDED] rounded-xl hover:bg-[#4B4B4B] transition-all duration-200" onClick={props.onClose}>Close</button>
            </div>
          </Show>
        </div>
      </div>
    </Show>
  );
}

export default PackageInfoModal; 
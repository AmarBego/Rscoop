import { For, Show, createEffect, createSignal } from "solid-js";
import { ScoopPackage, ScoopInfo } from "../types/scoop";
import hljs from 'highlight.js/lib/core';
import 'highlight.js/styles/github-dark.css';
import bash from 'highlight.js/lib/languages/bash';
import { Download, MoreHorizontal, FileText, Trash2 } from "lucide-solid";
import { invoke } from "@tauri-apps/api/core";
import ManifestModal from "./ManifestModal";

hljs.registerLanguage('bash', bash);

interface PackageInfoModalProps {
  pkg: ScoopPackage | null;
  info: ScoopInfo | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onInstall?: (pkg: ScoopPackage) => void;
  onUninstall?: (pkg: ScoopPackage) => void;
}

function PackageInfoModal(props: PackageInfoModalProps) {
  let codeRef: HTMLElement | undefined;

  // State for manifest modal
  const [manifestContent, setManifestContent] = createSignal<string | null>(null);
  const [manifestLoading, setManifestLoading] = createSignal(false);
  const [manifestError, setManifestError] = createSignal<string | null>(null);

  createEffect(() => {
    if (props.info?.notes && codeRef) {
      hljs.highlightElement(codeRef);
    }
  });

  const fetchManifest = async (pkg: ScoopPackage) => {
    setManifestLoading(true);
    setManifestError(null);
    setManifestContent(null);

    try {
      const result = await invoke<string>("get_package_manifest", {
        packageName: pkg.name,
        packageSource: pkg.source,
      });
      setManifestContent(result);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`Failed to fetch manifest for ${pkg.name}:`, errorMsg);
      setManifestError(`Failed to load manifest for ${pkg.name}: ${errorMsg}`);
    } finally {
      setManifestLoading(false);
    }
  };

  const closeManifestModal = () => {
    setManifestContent(null);
    setManifestLoading(false);
    setManifestError(null);
  };

  return (
    <>
      <dialog class="modal" open={!!props.pkg}>
        <div class="modal-box w-11/12 max-w-5xl bg-base-200 my-8">
          <div class="flex justify-between items-start">
            <h3 class="font-bold text-lg">Information for {props.pkg?.name}</h3>
            <div class="dropdown dropdown-end">
                <label tabindex="0" class="btn btn-ghost btn-sm btn-circle">
                    <MoreHorizontal class="w-5 h-5" />
                </label>
                <ul tabindex="0" class="dropdown-content menu p-2 shadow bg-base-300 rounded-box w-52 z-[100]">
                    <li>
                        <a onClick={() => props.pkg && fetchManifest(props.pkg)}>
                            <FileText class="w-4 h-4 mr-2" />
                            View Manifest
                        </a>
                    </li>
                    <li><a><i>Placeholder 1</i></a></li>
                    <li><a><i>Placeholder 2</i></a></li>
                </ul>
              </div>
          </div>
          
          <div class="py-4">
            <Show when={props.loading}>
              <div class="flex justify-center items-center h-40">
                <span class="loading loading-spinner loading-lg"></span>
              </div>
            </Show>
            <Show when={props.error}>
              <div role="alert" class="alert alert-error">
                <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span>{props.error}</span>
              </div>
            </Show>
            <Show when={props.info}>
              <div class="flex flex-col md:flex-row gap-6">
                <div class="flex-1">
                  <h4 class="text-lg font-medium mb-3 pb-2 border-b">Details</h4>
                  <div class="grid grid-cols-1 gap-x-4 gap-y-2 text-sm">
                    <For each={props.info?.details}>
                      {([key, value]) => (
                        <div class="grid grid-cols-3 gap-2 py-1 border-b border-base-content/10">
                          <div class="font-semibold text-base-content/70 capitalize col-span-1">{key.replace(/([A-Z])/g, ' $1')}:</div>
                          <div class="col-span-2">{value}</div>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
                <Show when={props.info?.notes}>
                  <div class="flex-1">
                    <h4 class="text-lg font-medium mb-3 border-b pb-2">Notes</h4>
                    <pre class="text-sm p-3 rounded-xl whitespace-pre-wrap font-sans">
                      <code ref={codeRef} class="language-bash">{props.info?.notes}</code>
                    </pre>
                  </div>
                </Show>
              </div>
            </Show>
          </div>
          <div class="modal-action">
            <form method="dialog">
              <Show when={!props.pkg?.is_installed && props.onInstall}>
                <button 
                  type="button"
                  class="btn btn-primary mr-2"
                  onClick={() => {
                    if (props.pkg) {
                      props.onInstall!(props.pkg)
                    }
                  }}
                >
                  <Download class="w-4 h-4 mr-2" />
                  Install
                </button>
              </Show>
              <Show when={props.pkg?.is_installed}>
                <button
                  type="button"
                  class="btn btn-error mr-2"
                  onClick={() => {
                    if (props.pkg) {
                      props.onUninstall?.(props.pkg);
                    }
                  }}
                >
                  <Trash2 class="w-4 h-4 mr-2" />
                  Uninstall
                </button>
              </Show>
              <button class="btn" onClick={props.onClose}>Close</button>
            </form>
          </div>
        </div>
        <form method="dialog" class="modal-backdrop">
          <button onClick={props.onClose}>close</button>
        </form>
      </dialog>
      <ManifestModal
        packageName={props.pkg?.name ?? ""}
        manifestContent={manifestContent()}
        loading={manifestLoading()}
        error={manifestError()}
        onClose={closeManifestModal}
      />
    </>
  );
}

export default PackageInfoModal; 
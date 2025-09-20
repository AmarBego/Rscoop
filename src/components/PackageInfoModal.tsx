import { For, Show, createEffect, createSignal, createMemo, Switch, Match } from "solid-js";
import { ScoopPackage, ScoopInfo } from "../types/scoop";
import hljs from 'highlight.js/lib/core';
import 'highlight.js/styles/github-dark.css';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import { Download, MoreHorizontal, FileText, Trash2, ExternalLink } from "lucide-solid";
import { invoke } from "@tauri-apps/api/core";
import ManifestModal from "./ManifestModal";
import { openPath } from '@tauri-apps/plugin-opener';

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('json', json);

interface PackageInfoModalProps {
  pkg: ScoopPackage | null;
  info: ScoopInfo | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onInstall?: (pkg: ScoopPackage) => void;
  onUninstall?: (pkg: ScoopPackage) => void;
  showBackButton?: boolean;
  onPackageStateChanged?: () => void; // Callback for when package state changes
}

// Component to render detail values. If it's a JSON string of an object/array, it pretty-prints and highlights it.
function DetailValue(props: { value: string }) {
  const parsed = createMemo(() => {
    try {
      const p = JSON.parse(props.value);
      if (p && typeof p === 'object') {
        return p;
      }
    } catch (e) {
      // Not a JSON object string
    }
    return null;
  });

  let codeRef: HTMLElement | undefined;
  createEffect(() => {
    if (parsed() && codeRef) {
      hljs.highlightElement(codeRef);
    }
  });

  return (
    <Show when={parsed()} fallback={<span class="break-words">{props.value}</span>}>
      <pre class="text-xs p-2 bg-base-100 rounded-lg whitespace-pre-wrap font-mono max-h-60 overflow-y-auto">
        <code ref={codeRef} class="language-json">
          {JSON.stringify(parsed(), null, 2)}
        </code>
      </pre>
    </Show>
  );
}

// Component to render long "Includes" lists in a compact, scrollable form
function IncludesValue(props: { value: string }) {
  const items = createMemo(() => props.value.split(/,\s*/).filter((s) => s.length > 0));
  return (
    <div class="max-h-60 overflow-y-auto">
      <ul class="list-disc list-inside text-xs space-y-0.5">
        <For each={items()}>{(item) => <ul class="break-all">{item}</ul>}</For>
      </ul>
    </div>
  );
}

function LicenseValue(props: { value: string }) {
  const license = createMemo(() => {
    try {
      const p = JSON.parse(props.value);
      if (p && typeof p === 'object' && p.identifier) {
        return {
          identifier: p.identifier as string,
          url: p.url as string | undefined,
        };
      }
    } catch (e) {
      // Not a JSON object string
    }
    return null;
  });

  return (
    <Show when={license()} fallback={<DetailValue value={props.value} />}>
      <Switch>
        <Match when={license()?.url}>
          <a
            href={license()!.url}
            target="_blank"
            rel="noopener noreferrer"
            class="link link-primary"
          >
            {license()!.identifier}
          </a>
        </Match>
        <Match when={!license()?.url}>
          <span class="break-words">{license()!.identifier}</span>
        </Match>
      </Switch>
    </Show>
  );
}

function PackageInfoModal(props: PackageInfoModalProps) {
  let codeRef: HTMLElement | undefined;

  const orderedDetails = createMemo(() => {
    if (!props.info?.details) return [];

    const desiredOrder = [
      'Name',
      'Description',
      'Bucket',
      'Installed Version',
      'Latest Version',
      'Version',
      'Includes',
      'Installed',
      'Homepage',
      'License'
    ];

    const detailsMap = new Map(props.info.details);
    const result: [string, string][] = [];

    for (const key of desiredOrder) {
      if (detailsMap.has(key)) {
        result.push([key, detailsMap.get(key)!]);
      }
    }

    return result;
  });

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
        bucket: pkg.source,
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
    <Show when={!!props.pkg}>
      <div class="modal modal-open backdrop-blur-sm" role="dialog" data-no-close-search>
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
                    <Show when={props.pkg?.is_installed}>
                        <li>
                            <button type="button" onClick={async () => {
                                if (props.pkg) {
                                    try {
                                        const packagePath = await invoke<string>("get_package_path", {
                                            packageName: props.pkg.name
                                        });
                                        await openPath(packagePath);
                                    } catch (error) {
                                        console.error('Failed to open package path:', error);
                                    }
                                }
                            }}>
                                <ExternalLink class="w-4 h-4 mr-2" />
                                Open in Explorer
                            </button>
                        </li>
                    </Show>
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
                    <For each={orderedDetails()}>
                      {([key, value]) => (
                        <div class="grid grid-cols-3 gap-2 py-1 border-b border-base-content/10">
                          <div class="font-semibold text-base-content/70 capitalize col-span-1">{key.replace(/([A-Z])/g, ' $1')}{key === 'Installed' || key === 'Includes'}:</div>
                          <div class="col-span-2">
                            <Switch fallback={<DetailValue value={value} />}>
                              <Match when={key === 'Homepage'}>
                                <a href={value} target="_blank" rel="noopener noreferrer" class="link link-primary break-all">{value}</a>
                              </Match>
                              <Match when={key === 'License'}>
                                <LicenseValue value={value} />
                              </Match>
                              <Match when={key === 'Includes'}>
                                <IncludesValue value={value} />
                              </Match>
                            </Switch>
                          </div>
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
                      props.onInstall!(props.pkg);
                      // Notify parent that package state may change
                      props.onPackageStateChanged?.();
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
                      // Notify parent that package state may change
                      props.onPackageStateChanged?.();
                    }
                  }}
                >
                  <Trash2 class="w-4 h-4 mr-2" />
                  Uninstall
                </button>
              </Show>
              <button class="btn" onClick={props.onClose}>
                {props.showBackButton ? "Back to Bucket" : "Close"}
              </button>
            </form>
          </div>
        </div>
        <div class="modal-backdrop" onClick={props.onClose}></div>
      </div>
      <ManifestModal
        packageName={props.pkg?.name ?? ""}
        manifestContent={manifestContent()}
        loading={manifestLoading()}
        error={manifestError()}
        onClose={closeManifestModal}
      />
    </Show>
  );
}

export default PackageInfoModal; 
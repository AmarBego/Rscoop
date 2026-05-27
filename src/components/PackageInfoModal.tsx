import { For, Show, createEffect, createSignal, createMemo, Switch, Match } from "solid-js";
import { ScoopPackage, ScoopInfo, VersionedPackageInfo } from "../types/scoop";
import hljs from 'highlight.js/lib/core';

import json from 'highlight.js/lib/languages/json';
import { Copy, Download, Ellipsis, FileText, Trash2, ExternalLink, Check } from "lucide-solid";
import { invoke } from "@tauri-apps/api/core";
import Modal from "./common/Modal";
import { Dropdown, DropdownItem } from "./common/Dropdown";
import { useI18n } from "../i18n";
import { writeClipboardText } from "../utils/clipboard";
import { getErrorMessage } from "../utils/errors";

hljs.registerLanguage('json', json);

type PackageTab = "details" | "manifest";

interface PackageInfoModalProps {
  pkg: ScoopPackage | null;
  info: ScoopInfo | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onInstall?: (pkg: ScoopPackage, version?: string) => void;
  onUninstall?: (pkg: ScoopPackage) => void;
  onSwitchVersion?: (pkg: ScoopPackage, version: string) => void;
  showBackButton?: boolean;
  autoShowVersions?: boolean; // Auto-expand version switcher
  isPackageVersioned?: (packageName: string) => boolean; // Function to check if package has multiple versions
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
    <div class="max-h-[4.5rem] overflow-y-auto">
      <ul class="list-disc list-inside text-xs space-y-0.5">
        <For each={items()}>{(item) => <li class="break-all">{item}</li>}</For>
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
  const { t } = useI18n();
  let notesCodeRef: HTMLElement | undefined;
  let manifestCodeRef: HTMLElement | undefined;

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

  // Active tab
  const [activeTab, setActiveTab] = createSignal<PackageTab>("details");

  // State for versioned install
  const [installVersion, setInstallVersion] = createSignal("");
  const [actionFired, setActionFired] = createSignal<"install" | "uninstall" | null>(null);

  const flashAction = (action: "install" | "uninstall") => {
    setActionFired(action);
    setTimeout(() => setActionFired(null), 1500);
  };

  // State for manifest (folded in from former ManifestModal)
  const [manifestContent, setManifestContent] = createSignal<string | null>(null);
  const [manifestLoading, setManifestLoading] = createSignal(false);
  const [manifestError, setManifestError] = createSignal<string | null>(null);
  const [copied, setCopied] = createSignal(false);

  // State for version switching
  const [versionInfo, setVersionInfo] = createSignal<VersionedPackageInfo | null>(null);
  const [versionLoading, setVersionLoading] = createSignal(false);
  const [versionError, setVersionError] = createSignal<string | null>(null);
  const [switchingVersion, setSwitchingVersion] = createSignal<string | null>(null);

  createEffect(() => {
    if (props.info?.notes && notesCodeRef) {
      hljs.highlightElement(notesCodeRef);
    }
  });

  // Highlight manifest when it appears in the active tab
  createEffect(() => {
    const content = manifestContent();
    if (activeTab() === "manifest" && content && manifestCodeRef) {
      manifestCodeRef.textContent = content;
      manifestCodeRef.className = 'language-json font-mono text-sm leading-relaxed !bg-transparent';
      hljs.highlightElement(manifestCodeRef);
    }
  });

  // Auto-fetch version info for installed packages that have multiple versions
  createEffect(() => {
    if (props.pkg?.is_installed && props.isPackageVersioned?.(props.pkg.name)) {
      fetchVersionInfo(props.pkg);
    }
  });

  // Clear state when modal closes
  createEffect(() => {
    if (!props.pkg) {
      setActiveTab("details");
      setManifestContent(null);
      setManifestError(null);
      setManifestLoading(false);
      setCopied(false);
      setVersionInfo(null);
      setVersionError(null);
      setVersionLoading(false);
      setSwitchingVersion(null);
    }
  });

  // Clear state when switching to a different package
  createEffect((prevPackageName) => {
    const currentPackageName = props.pkg?.name;
    if (prevPackageName !== undefined && prevPackageName !== currentPackageName) {
      setActiveTab("details");
      setManifestContent(null);
      setManifestError(null);
      setManifestLoading(false);
      setCopied(false);
      setVersionInfo(null);
      setVersionError(null);
      setVersionLoading(false);
      setSwitchingVersion(null);
      setInstallVersion("");
    }
    return currentPackageName;
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
      const errorMsg = getErrorMessage(err);
      console.error(`Failed to fetch manifest for ${pkg.name}:`, errorMsg);
      setManifestError(`Failed to load manifest for ${pkg.name}: ${errorMsg}`);
    } finally {
      setManifestLoading(false);
    }
  };

  const maybeLoadManifest = () => {
    if (props.pkg && !manifestContent() && !manifestLoading()) {
      fetchManifest(props.pkg);
    }
  };

  const handleCopy = async () => {
    const content = manifestContent();
    if (content) {
      try {
        await writeClipboardText(content);
        setManifestError(null);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        const errorMsg = getErrorMessage(err);
        console.error("Failed to copy manifest to clipboard:", errorMsg);
        setManifestError(`Failed to copy manifest to clipboard: ${errorMsg}`);
      }
    }
  };

  const selectTab = (tab: PackageTab) => {
    setActiveTab(tab);
    if (tab === "manifest") maybeLoadManifest();
  };

  const handleTabKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next: PackageTab = activeTab() === "details" ? "manifest" : "details";
    selectTab(next);
    queueMicrotask(() => {
      document.getElementById(`pkg-tab-${next}-btn`)?.focus();
    });
  };

  const fetchVersionInfo = async (pkg: ScoopPackage) => {
    setVersionLoading(true);
    setVersionError(null);
    setVersionInfo(null);

    try {
      const result = await invoke<VersionedPackageInfo>("get_package_versions", {
        packageName: pkg.name,
        global: false, // TODO: Add support for global packages
      });
      setVersionInfo(result);
    } catch (err) {
      const errorMsg = getErrorMessage(err);
      console.error(`Failed to fetch versions for ${pkg.name}:`, errorMsg);
      setVersionError(`Failed to load versions for ${pkg.name}: ${errorMsg}`);
    } finally {
      setVersionLoading(false);
    }
  };

  const switchVersion = async (pkg: ScoopPackage, targetVersion: string) => {
    setSwitchingVersion(targetVersion);
    try {
      await invoke<string>("switch_package_version", {
        packageName: pkg.name,
        targetVersion,
        global: false, // TODO: Add support for global packages
      });

      // Refresh version info after switching
      await fetchVersionInfo(pkg);

      // Notify parent that package state may have changed
      props.onPackageStateChanged?.();

      // Call the onSwitchVersion callback if provided
      props.onSwitchVersion?.(pkg, targetVersion);

    } catch (err) {
      const errorMsg = getErrorMessage(err);
      console.error(`Failed to switch ${pkg.name} to version ${targetVersion}:`, errorMsg);
      setVersionError(`Failed to switch to version ${targetVersion}: ${errorMsg}`);
    } finally {
      setSwitchingVersion(null);
    }
  };

  const headerAction = (
    <Show when={props.pkg?.is_installed}>
      <Dropdown
        iconOnly
        ariaLabel="Package actions"
        trigger={<Ellipsis class="w-5 h-5" aria-hidden="true" />}
      >
        <DropdownItem
          icon={<ExternalLink class="w-4 h-4" aria-hidden="true" />}
          onClick={async () => {
            if (props.pkg) {
              try {
                await invoke("open_package_path", {
                  packageName: props.pkg.name
                });
              } catch (error) {
                console.error('Failed to open package path:', getErrorMessage(error));
              }
            }
          }}
        >
          {t("modal.package.openInExplorer")}
        </DropdownItem>
        <DropdownItem
          icon={<FileText class="w-4 h-4" aria-hidden="true" />}
          onClick={async () => {
            if (props.pkg) {
              try {
                const debug = await invoke<string>("debug_package_structure", {
                  packageName: props.pkg.name,
                  global: false,
                });
                console.log("Package structure debug:", debug);
              } catch (error) {
                console.error('Debug failed:', getErrorMessage(error));
              }
            }
          }}
        >
          {t("modal.package.debugStructure")}
        </DropdownItem>
      </Dropdown>
    </Show>
  );

  const footer = (
    <div class="flex gap-2">
      <Show when={!props.pkg?.is_installed && props.onInstall}>
        <div class="flex items-center gap-2">
          <input
            type="text"
            placeholder="Version (optional)"
            class="input input-bordered input-md w-36"
            value={installVersion()}
            onInput={(e) => setInstallVersion(e.currentTarget.value)}
          />
          <button
            type="button"
            class="btn btn-primary btn-md"
            classList={{ "btn-success": actionFired() === "install" }}
            disabled={actionFired() === "install"}
            onClick={() => {
              if (props.pkg) {
                const ver = installVersion().trim();
                props.onInstall!(props.pkg, ver || undefined);
                props.onPackageStateChanged?.();
                setInstallVersion("");
                flashAction("install");
              }
            }}
          >
            <Show when={actionFired() === "install"} fallback={
              <>
                <Download class="w-4 h-4 mr-2" />
                {installVersion().trim() ? t("modal.package.installVersion", { version: installVersion().trim() }) : t("common.install")}
              </>
            }>
              <Check class="w-4 h-4 mr-2" />
              {t("common.queued")}
            </Show>
          </button>
        </div>
      </Show>
      <Show when={props.pkg?.is_installed}>
        <button
          type="button"
          class="btn btn-error btn-md"
          classList={{ "btn-success": actionFired() === "uninstall" }}
          disabled={actionFired() === "uninstall"}
          onClick={() => {
            if (props.pkg) {
              props.onUninstall?.(props.pkg);
              props.onPackageStateChanged?.();
              flashAction("uninstall");
            }
          }}
        >
          <Show when={actionFired() === "uninstall"} fallback={
            <>
              <Trash2 class="w-4 h-4 mr-2" />
              {t("common.uninstall")}
            </>
          }>
            <Check class="w-4 h-4 mr-2" />
            {t("common.queued")}
          </Show>
        </button>
      </Show>
      <button class="btn-close-outline" onClick={props.onClose}>
        {props.showBackButton ? t("modal.package.backToBucket") : t("common.close")}
      </button>
    </div>
  );

  return (
    <Show when={!!props.pkg}>
      <Modal
        isOpen={!!props.pkg}
        onClose={props.onClose}
        title={
          <span class="flex items-center gap-2">
            {t("modal.package.title", { name: "" })}<span class="text-info font-mono">{props.pkg?.name}</span>
          </span>
        }
        size="large"
        headerAction={headerAction}
        footer={footer}
        preventBackdropClose={false}
      >
        <Show when={props.loading}>
          <div class="flex justify-center items-center h-40">
            <span class="loading loading-spinner loading-lg"></span>
          </div>
        </Show>
        <Show when={props.error}>
          <div role="alert" class="alert alert-error">
            <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <span>{props.error}</span>
          </div>
        </Show>
        <Show when={props.info}>
          {/* Tablist */}
          <div role="tablist" class="tabs tabs-border mb-4" onKeyDown={handleTabKeyDown}>
            <button
              type="button"
              role="tab"
              id="pkg-tab-details-btn"
              aria-selected={activeTab() === "details"}
              aria-controls="pkg-tab-details-panel"
              class="tab"
              classList={{ "tab-active": activeTab() === "details" }}
              onClick={() => selectTab("details")}
            >
              {t("modal.package.details")}
            </button>
            <button
              type="button"
              role="tab"
              id="pkg-tab-manifest-btn"
              aria-selected={activeTab() === "manifest"}
              aria-controls="pkg-tab-manifest-panel"
              class="tab"
              classList={{ "tab-active": activeTab() === "manifest" }}
              onClick={() => selectTab("manifest")}
            >
              {t("modal.package.tabManifest")}
            </button>
          </div>

          {/* Details panel */}
          <Show when={activeTab() === "details"}>
            <div
              role="tabpanel"
              id="pkg-tab-details-panel"
              aria-labelledby="pkg-tab-details-btn"
            >
              <div class="flex flex-col md:flex-row gap-6">
                <div class="flex-1">
                  <div class="grid grid-cols-1 gap-x-4 gap-y-2 text-sm">
                    <For each={orderedDetails()}>
                      {([key, value]) => (
                        <div class="grid grid-cols-3 gap-2 py-1 border-b border-base-content/10">
                          <div class="font-semibold text-base-content/70 capitalize col-span-1">{key.replace(/([A-Z])/g, ' $1')}:</div>
                          <div class="col-span-2">
                            <Switch fallback={<DetailValue value={value} />}>
                              <Match when={key === 'Bucket' && value.includes('(missing)')}>
                                <span class="text-warning">{value}</span>
                              </Match>
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
                    <h4 class="text-lg font-medium mb-3 border-b pb-2">{t("modal.package.notes")}</h4>
                    <div class="bg-code rounded-xl overflow-hidden border border-base-content/10 shadow-inner">
                      <pre class="p-4 m-0">
                        <code ref={notesCodeRef} class="nohighlight font-mono text-sm leading-relaxed !bg-transparent whitespace-pre-wrap">{props.info?.notes}</code>
                      </pre>
                    </div>
                  </div>
                </Show>
              </div>

              {/* Version Switcher Section (Details tab only) */}
              <Show when={versionInfo()}>
                <div class="divider">{t("modal.package.versionManager")}</div>
                <div class="bg-base-300 rounded-lg p-4">
                  <h4 class="text-lg font-medium mb-3">{t("modal.package.availableVersions")}</h4>
                  <Show when={versionError()}>
                    <div role="alert" class="alert alert-error mb-3">
                      <span>{versionError()}</span>
                    </div>
                  </Show>
                  <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    <For each={versionInfo()?.available_versions || []}>
                      {(version) => (
                        <div
                          class="card bg-base-100 shadow-sm p-3 transition-all hover:shadow-md"
                          classList={{
                            "ring-2 ring-primary": version.is_current,
                          }}
                        >
                          <div class="flex items-center justify-between">
                            <div>
                              <div class="font-semibold text-sm">{version.version}</div>
                              <Show when={version.is_current}>
                                <div class="text-xs text-primary font-medium">{t("modal.package.currentVersion")}</div>
                              </Show>
                            </div>
                            <Show when={!version.is_current}>
                              <button
                                class="btn btn-xs btn-primary"
                                disabled={switchingVersion() === version.version}
                                onClick={() => props.pkg && switchVersion(props.pkg, version.version)}
                              >
                                <Show when={switchingVersion() === version.version}
                                  fallback={t("modal.package.switchVersion")}
                                >
                                  <span class="loading loading-spinner loading-xs"></span>
                                </Show>
                              </button>
                            </Show>
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              </Show>

              <Show when={versionLoading()}>
                <div class="divider">{t("modal.package.versionManager")}</div>
                <div class="bg-base-300 rounded-lg p-4">
                  <div class="flex justify-center items-center h-20">
                    <span class="loading loading-spinner loading-lg"></span>
                  </div>
                </div>
              </Show>
            </div>
          </Show>

          {/* Manifest panel */}
          <Show when={activeTab() === "manifest"}>
            <div
              role="tabpanel"
              id="pkg-tab-manifest-panel"
              aria-labelledby="pkg-tab-manifest-btn"
            >
              <Show when={manifestLoading()}>
                <div class="flex flex-col justify-center items-center h-64 gap-4">
                  <span class="loading loading-spinner loading-lg text-primary"></span>
                  <span class="text-base-content/60">{t("modal.manifest.loading")}</span>
                </div>
              </Show>

              <Show when={manifestError()}>
                <div role="alert" class="alert alert-error shadow-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <span>{manifestError()}</span>
                </div>
              </Show>

              <Show when={manifestContent()}>
                <div class="bg-code relative rounded-xl border border-base-content/10 shadow-inner group">
                  <div class="absolute right-2 top-2 z-10 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 supports-[hover:none]:opacity-100 transition-opacity duration-200">
                    <button
                      type="button"
                      class="btn btn-sm btn-square btn-ghost text-base-content/70 hover:text-base-content hover:bg-base-content/10"
                      onClick={handleCopy}
                      title={t("modal.manifest.copyToClipboard")}
                      aria-label={t("modal.manifest.copyToClipboard")}
                    >
                      <Show when={copied()} fallback={<Copy class="w-4 h-4" />}>
                        <Check class="w-4 h-4 text-success" />
                      </Show>
                    </button>
                  </div>
                  <div class="overflow-y-auto max-h-[calc(70vh-10rem)] custom-scrollbar">
                    <pre class="p-4 m-0"><code ref={manifestCodeRef} class="language-json font-mono text-sm leading-relaxed !bg-transparent"></code></pre>
                  </div>
                </div>
              </Show>
            </div>
          </Show>
        </Show>
      </Modal>
    </Show>
  );
}

export default PackageInfoModal;

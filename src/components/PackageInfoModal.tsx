import { For, Show, createEffect, createSignal, createMemo, Switch, Match, on, onCleanup } from "solid-js";
import { ScoopPackage, ScoopInfo, VersionedPackageInfo } from "../types/scoop";
import hljs from 'highlight.js/lib/core';

import json from 'highlight.js/lib/languages/json';
import { Download, Ellipsis, FileText, Trash2, ExternalLink, Check } from "lucide-solid";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import Modal from "./common/Modal";
import ManifestPanel from "./ManifestPanel";
import { manifestReview } from "../stores/manifestReview";
import { Dropdown, DropdownItem } from "./common/Dropdown";
import { useI18n } from "../i18n";
import installedPackagesStore from "../stores/installedPackagesStore";
import { getErrorMessage } from "../utils/errors";

hljs.registerLanguage('json', json);

type PackageTab = "details" | "manifest";
type PackageDetailKey =
  | "Name"
  | "Description"
  | "Bucket"
  | "Installed Version"
  | "Latest Version"
  | "Version"
  | "Includes"
  | "Installed"
  | "Homepage"
  | "License";

interface PackageInfoModalProps {
  initialTab?: PackageTab;
  reviewRequest?: number;
  reviewOnly?: boolean;
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
      <pre dir="ltr" class="text-xs p-2 bg-base-100 rounded-lg whitespace-pre-wrap font-mono max-h-60 overflow-y-auto text-start">
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
  const [manifestDirty, setManifestDirty] = createSignal(false);
  const [manifestBusy, setManifestBusy] = createSignal(false);
  const [refreshedInfo, setRefreshedInfo] = createSignal<ScoopInfo | null>(null);
  const displayInfo = () => refreshedInfo() ?? props.info;
  const packageKey = () => `${props.pkg?.source}\0${props.pkg?.name}`;
  let closePending = false;

  const requestClose = async () => {
    if (manifestBusy() || closePending) return false;
    closePending = true;
    try {
      if (manifestDirty() && !await ask(t("modal.manifest.discardMessage"), {
        title: t("modal.manifest.unsaved"), kind: "warning",
        okLabel: t("modal.manifest.discard"), cancelLabel: t("modal.manifest.keepEditing"),
      })) return false;
      props.onClose();
      return true;
    } catch (err) {
      console.error("Failed to confirm closing the manifest editor:", getErrorMessage(err));
      return false;
    } finally {
      closePending = false;
    }
  };

  const manifestChanged = () => {
    const key = packageKey();
    const pkg = props.pkg;
    if (!pkg) return;
    invoke<ScoopInfo>("get_package_info", { packageName: pkg.name, bucket: pkg.source }).then(result => {
      if (packageKey() === key) setRefreshedInfo(result);
    }).catch(err => console.error("Failed to refresh package details:", getErrorMessage(err)));
    void installedPackagesStore.reload();
    props.onPackageStateChanged?.();
  };

  const orderedDetails = createMemo(() => {
    if (!displayInfo()?.details) return [];

    const desiredOrder: PackageDetailKey[] = [
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

    const detailsMap = new Map(displayInfo()!.details);
    const result: [string, string][] = [];

    for (const key of desiredOrder) {
      if (detailsMap.has(key)) {
        result.push([key, detailsMap.get(key)!]);
      }
    }

    return result;
  });

  const detailLabel = (key: string) => {
    const labels: Record<PackageDetailKey, string> = {
      "Name": t("modal.package.detailName"),
      "Description": t("modal.package.detailDescription"),
      "Bucket": t("modal.package.detailBucket"),
      "Installed Version": t("modal.package.detailInstalledVersion"),
      "Latest Version": t("modal.package.detailLatestVersion"),
      "Version": t("modal.package.detailVersion"),
      "Includes": t("modal.package.detailIncludes"),
      "Installed": t("modal.package.detailInstalled"),
      "Homepage": t("modal.package.detailHomepage"),
      "License": t("modal.package.detailLicense"),
    };

    return labels[key as PackageDetailKey] ?? key.replace(/([A-Z])/g, ' $1');
  };

  // Active tab
  const [activeTab, setActiveTab] = createSignal<PackageTab>(props.initialTab ?? "details");
  const [reviewRequest, setReviewRequest] = createSignal(0);
  createEffect(on(() => props.reviewRequest, request => {
    if (request) { setActiveTab("manifest"); setReviewRequest(value => value + 1); }
  }));
  createEffect(() => {
    if (!props.pkg) return;
    onCleanup(manifestReview.registerDialog(async target => {
      if (props.pkg?.name === target.packageName && props.pkg?.source === target.bucket) {
        setActiveTab("manifest");
        setReviewRequest(value => value + 1);
        return false;
      }
      return requestClose();
    }));
  });

  // State for versioned install
  const [installVersion, setInstallVersion] = createSignal("");
  const [actionFired, setActionFired] = createSignal<"install" | "uninstall" | null>(null);

  const flashAction = (action: "install" | "uninstall") => {
    setActionFired(action);
    setTimeout(() => setActionFired(null), 1500);
  };

  // State for version switching
  const [versionInfo, setVersionInfo] = createSignal<VersionedPackageInfo | null>(null);
  const [versionLoading, setVersionLoading] = createSignal(false);
  const [versionError, setVersionError] = createSignal<string | null>(null);
  const [switchingVersion, setSwitchingVersion] = createSignal<string | null>(null);

  createEffect(() => {
    if (displayInfo()?.notes && notesCodeRef) {
      hljs.highlightElement(notesCodeRef);
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
      setActiveTab(props.initialTab ?? "details");
      setReviewRequest(0);
      setRefreshedInfo(null);
      setVersionInfo(null);
      setVersionError(null);
      setVersionLoading(false);
      setSwitchingVersion(null);
    }
  });

  // Clear state when switching to a different package
  createEffect((prevPackageName) => {
    const currentPackageName = packageKey();
    if (prevPackageName !== undefined && prevPackageName !== currentPackageName) {
      setActiveTab(props.initialTab ?? "details");
      setRefreshedInfo(null);
      setVersionInfo(null);
      setVersionError(null);
      setVersionLoading(false);
      setSwitchingVersion(null);
      setInstallVersion("");
    }
    return currentPackageName;
  });

  const selectTab = (tab: PackageTab) => {
    setActiveTab(tab);
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
      setVersionError(t("modal.package.versionsLoadError", { name: pkg.name, error: errorMsg }));
    } finally {
      setVersionLoading(false);
    }
  };

  const switchVersion = async (pkg: ScoopPackage, targetVersion: string) => {
    if (manifestDirty() || manifestBusy() || switchingVersion()) return;
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
      setVersionError(t("modal.package.switchVersionError", { version: targetVersion, error: errorMsg }));
    } finally {
      setSwitchingVersion(null);
    }
  };

  const openPackagePath = async () => {
    if (!props.pkg) return;

    try {
      await invoke("open_package_path", {
        packageName: props.pkg.name,
      });
    } catch (error) {
      console.error('Failed to open package path:', getErrorMessage(error));
    }
  };

  const headerAction = (
    <Show when={props.pkg?.is_installed}>
      <Dropdown
        iconOnly
        ariaLabel={t("modal.package.actions")}
        trigger={<Ellipsis class="w-5 h-5" aria-hidden="true" />}
      >
        <DropdownItem
          icon={<ExternalLink class="w-4 h-4" aria-hidden="true" />}
          onClick={openPackagePath}
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
      <Show when={!props.reviewOnly && activeTab() === "details" && !props.pkg?.is_installed && props.onInstall}>
        <div class="flex items-center gap-2">
          <input
            type="text"
            placeholder={t("modal.package.versionPlaceholder")}
            class="input input-bordered input-md w-36"
            value={installVersion()}
            onInput={(e) => setInstallVersion(e.currentTarget.value)}
          />
          <button
            type="button"
            class="btn btn-primary btn-md"
            classList={{ "btn-success": actionFired() === "install" }}
            disabled={actionFired() === "install" || manifestDirty() || manifestBusy()}
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
                <Download class="w-4 h-4 me-2" />
                {installVersion().trim() ? t("modal.package.installVersion", { version: installVersion().trim() }) : t("common.install")}
              </>
            }>
              <Check class="w-4 h-4 me-2" />
              {t("common.queued")}
            </Show>
          </button>
        </div>
      </Show>
      <Show when={!props.reviewOnly && activeTab() === "details" && props.pkg?.is_installed}>
        <button
          type="button"
          class="btn btn-error btn-md"
          classList={{ "btn-success": actionFired() === "uninstall" }}
          disabled={actionFired() === "uninstall" || manifestDirty() || manifestBusy()}
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
              <Trash2 class="w-4 h-4 me-2" />
              {t("common.uninstall")}
            </>
          }>
            <Check class="w-4 h-4 me-2" />
            {t("common.queued")}
          </Show>
        </button>
      </Show>
      <button class="btn-close-outline" disabled={manifestBusy()} onClick={requestClose}>
        {props.showBackButton ? t("modal.package.backToBucket") : t("common.close")}
      </button>
    </div>
  );

  return (
    <Show when={!!props.pkg}>
      <Modal
        isOpen={!!props.pkg}
        onClose={requestClose}
        title={
          <span class="flex items-center gap-2">
            {t("modal.package.title", { name: "" })}<span class="text-info font-mono">{props.pkg?.name}</span>
          </span>
        }
        size="large"
        headerAction={!props.reviewOnly && activeTab() === "details" ? headerAction : undefined}
        footer={footer}
        preventBackdropClose={false}
      >
        <Show when={props.loading && activeTab() === "details"}>
          <div class="flex justify-center items-center h-40">
            <span class="loading loading-spinner loading-lg"></span>
          </div>
        </Show>
        <Show when={props.error && !refreshedInfo() && activeTab() === "details"}>
          <div role="alert" class="alert alert-error">
            <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <span>{props.error}</span>
          </div>
        </Show>
        <Show when={props.pkg}>
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
                          <div class="font-semibold text-base-content/70 capitalize col-span-1">{detailLabel(key)}:</div>
                          <div class="col-span-2">
                            <Switch fallback={<DetailValue value={value} />}>
                              <Match when={key === 'Bucket' && value.includes('(missing)')}>
                                <span class="text-warning">{value}</span>
                              </Match>
                              <Match when={key === 'Homepage'}>
                                <a href={value} target="_blank" rel="noopener noreferrer" class="link link-primary break-all">{value}</a>
                              </Match>
                              <Match when={key === 'Installed'}>
                                <button type="button" class="link link-primary break-all text-start" onClick={openPackagePath}>
                                  {value}
                                </button>
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
                <Show when={displayInfo()?.notes}>
                  <div class="flex-1">
                    <h4 class="text-lg font-medium mb-3 border-b pb-2">{t("modal.package.notes")}</h4>
                    <div class="bg-code rounded-xl overflow-hidden border border-base-content/10 shadow-inner">
                      <pre class="p-4 m-0">
                        <code ref={notesCodeRef} class="nohighlight font-mono text-sm leading-relaxed !bg-transparent whitespace-pre-wrap">{displayInfo()?.notes}</code>
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
                                disabled={!!switchingVersion() || manifestDirty() || manifestBusy()}
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

          {/* Keep drafts mounted when switching between Details and Manifest. */}
          <Show when={props.pkg}>
            <ManifestPanel pkg={props.pkg!} active={activeTab() === "manifest"}
              reviewRequest={reviewRequest()}
              onDirtyChange={setManifestDirty} onBusyChange={setManifestBusy} onChanged={manifestChanged} />
          </Show>
        </Show>
      </Modal>
    </Show>
  );
}

export default PackageInfoModal;

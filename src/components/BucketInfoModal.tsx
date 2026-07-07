import { For, Show, createMemo, Switch, Match, createSignal } from "solid-js";
import { BucketInfo } from "../hooks/useBuckets";
import { SearchableBucket } from "../hooks/useBucketSearch";
import { useBucketInstall } from "../hooks/useBucketInstall";
import hljs from 'highlight.js/lib/core';

import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import { Ellipsis, GitBranch, ExternalLink, Download, Trash2, LoaderCircle } from "lucide-solid";
import { invoke } from "@tauri-apps/api/core";
import Modal from "./common/Modal";
import { Dropdown, DropdownItem } from "./common/Dropdown";
import { openUrl } from '@tauri-apps/plugin-opener';
import { useI18n } from "../i18n";
import { getErrorMessage } from "../utils/errors";

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('json', json);

interface BucketInfoModalProps {
  bucket: BucketInfo | null;
  manifests: string[];
  manifestsLoading: boolean;
  error: string | null;
  description?: string; // Optional description for external/search buckets
  searchBucket?: SearchableBucket; // For external buckets from search
  isInstalled?: boolean; // Whether this bucket is currently installed
  installedBuckets?: BucketInfo[]; // List of installed buckets to check against
  onClose: () => void;
  onPackageClick?: (packageName: string, bucketName: string) => void;
  onBucketInstalled?: () => void; // Callback when bucket is installed/removed
  onFetchManifests?: (bucketName: string) => Promise<void>; // Callback to fetch manifests for newly installed bucket
}

type BucketDetailKey = "Name" | "Type" | "Manifests" | "Branch" | "Last Updated" | "Path";

// Component to render bucket detail values
function DetailValue(props: { value: string | number | undefined }) {
  const { t } = useI18n();
  const displayValue = () => {
    if (props.value === undefined || props.value === null) return t("common.unknown");
    return String(props.value);
  };

  return <span class="break-words">{displayValue()}</span>;
}

// Component to render manifest lists in a compact, scrollable form
function ManifestsList(props: { manifests: string[]; loading: boolean; onPackageClick?: (packageName: string) => void }) {
  const { t } = useI18n();
  const packageNameFromManifest = (manifest: string) => manifest
    .replace(/ \(root\)$/, '')
    .split(/[\\/]/)
    .pop()
    ?.replace(/\.json$/i, '') || manifest;

  return (
    <Show when={!props.loading} fallback={
      <div class="flex items-center gap-2 py-4">
        <span class="loading loading-spinner loading-sm"></span>
        <span class="text-sm">{t("modal.bucket.loadingPackages")}</span>
      </div>
    }>
      <Show when={props.manifests.length > 0} fallback={
        <div class="text-center py-4">
          <p class="text-sm text-base-content/70">{t("modal.bucket.noPackages")}</p>
        </div>
      }>
        <div class="max-h-60 overflow-y-auto">
          <div class="grid grid-cols-2 gap-1 text-xs">
            <For each={props.manifests}>
              {(manifest) => {
                const packageName = packageNameFromManifest(manifest);
                return (
                  <button
                    type="button"
                    class="text-start hover:text-primary cursor-pointer py-0.5 px-1 rounded hover:bg-base-300 transition-colors"
                    onClick={() => props.onPackageClick?.(packageName)}
                    title={t("modal.bucket.viewPackageInfo", { name: packageName })}
                  >
                    {packageName}
                  </button>
                );
              }}
            </For>
          </div>
        </div>
      </Show>
    </Show>
  );
}

function BucketInfoModal(props: BucketInfoModalProps) {
  const { t } = useI18n();
  const bucketInstall = useBucketInstall();
  const [operationError, setOperationError] = createSignal<string | null>(null);

  const bucketName = () => props.bucket?.name || props.searchBucket?.name || '';
  const isExternalBucket = () => !props.bucket && !!props.searchBucket;

  // Properly check if bucket is installed
  const isInstalled = () => {
    const name = bucketName();

    // If explicitly provided, use that
    if (props.isInstalled !== undefined) {
      return props.isInstalled;
    }

    // If we have a bucket from local data (props.bucket), it's installed
    if (props.bucket && !props.searchBucket) {
      return true;
    }

    // If we have installed buckets list, check against it
    if (props.installedBuckets && name) {
      const installed = props.installedBuckets.some(installed => installed.name === name);
      return installed;
    }

    // Default: if it's a search bucket only, it's not installed
    return false;
  };

  // Handle bucket installation
  const handleInstallBucket = async () => {
    if (!props.searchBucket) return;
    setOperationError(null);

    try {
      const result = await bucketInstall.installBucket({
        name: props.searchBucket.name,
        url: props.searchBucket.url,
        force: false,
      });

      if (result.success) {
        console.log('Bucket installed successfully from modal, refreshing bucket list');

        // First refresh the bucket list
        props.onBucketInstalled?.();

        // Then fetch manifests for the newly installed bucket
        if (props.onFetchManifests) {
          console.log('Fetching manifests for newly installed bucket:', props.searchBucket.name);
          await props.onFetchManifests(props.searchBucket.name);
        }
      } else {
        console.error('Bucket installation failed:', result.message);
        setOperationError(result.message);
      }
    } catch (error) {
      const errorMsg = getErrorMessage(error, t("common.unknownError"));
      console.error('Failed to install bucket:', errorMsg);
      setOperationError(errorMsg);
    }
  };

  // Handle bucket removal
  const handleRemoveBucket = async () => {
    const name = bucketName();
    if (!name) return;
    setOperationError(null);

    try {
      const result = await bucketInstall.removeBucket(name);

      if (result.success) {
        console.log('Bucket removed successfully from modal, refreshing bucket list');
        props.onBucketInstalled?.();
        // Close modal after successful removal
        props.onClose();
      } else {
        console.error('Bucket removal failed:', result.message);
        setOperationError(result.message);
      }
    } catch (error) {
      const errorMsg = getErrorMessage(error, t("common.unknownError"));
      console.error('Failed to remove bucket:', errorMsg);
      setOperationError(errorMsg);
    }
  };
  const orderedDetails = createMemo(() => {
    if (!props.bucket) return [];

    const details: [BucketDetailKey, string | number | undefined][] = [
      ['Name', props.bucket.name],
      ['Type', props.bucket.is_git_repo ? t("modal.bucket.gitRepo") : t("modal.bucket.localDir")],
      ['Manifests', props.bucket.manifest_count],
      ['Branch', props.bucket.git_branch],
      ['Last Updated', props.bucket.last_updated],
      ['Path', props.bucket.path],
    ];

    // Filter out undefined values
    return details.filter(([_, value]) => value !== undefined && value !== null);
  });

  const detailLabel = (key: BucketDetailKey) => {
    const labels: Record<BucketDetailKey, string> = {
      "Name": t("modal.bucket.name"),
      "Type": t("modal.bucket.type"),
      "Manifests": t("modal.bucket.manifests"),
      "Branch": t("modal.bucket.branch"),
      "Last Updated": t("modal.bucket.lastUpdated"),
      "Path": t("modal.bucket.path"),
    };

    return labels[key];
  };

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return t("common.unknown");
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString; // Return as-is if parsing fails
    }
  };

  const headerAction = (
    <div class="flex items-center gap-2">
      <Show when={props.bucket?.is_git_repo}>
        <div class="badge badge-info badge-sm">
          <GitBranch class="w-3 h-3 me-1" aria-hidden="true" />
          {t("modal.bucket.git")}
        </div>
      </Show>
      <Show when={isExternalBucket()}>
        <div class="badge badge-warning badge-sm">
          {t("modal.bucket.external")}
        </div>
      </Show>
      <Dropdown
        iconOnly
        ariaLabel={t("modal.bucket.actions")}
        trigger={<Ellipsis class="w-5 h-5" aria-hidden="true" />}
      >
        <Show when={props.bucket?.path}>
          <DropdownItem
            icon={<ExternalLink class="w-4 h-4" aria-hidden="true" />}
            onClick={async () => {
              if (props.bucket?.name) {
                try {
                  await invoke("open_bucket_path", { bucketName: props.bucket.name });
                } catch (error) {
                  console.error('Failed to open path:', getErrorMessage(error));
                }
              }
            }}
          >
            {t("modal.bucket.openInExplorer")}
          </DropdownItem>
        </Show>
        <DropdownItem
          disabled={!props.bucket?.git_url && !props.searchBucket?.url}
          onClick={async () => {
            const url = props.bucket?.git_url || props.searchBucket?.url;
            if (url) {
              try {
                await openUrl(url);
              } catch (error) {
                console.error('Failed to open URL:', getErrorMessage(error));
              }
            }
          }}
        >
          {t("modal.bucket.viewOnGithub")}
        </DropdownItem>
      </Dropdown>
    </div>
  );

  const footer = (
    <>
      <Show when={!isInstalled() && props.searchBucket}>
        <button
          type="button"
          class="btn btn-primary"
          onClick={handleInstallBucket}
          disabled={bucketInstall.isBucketBusy(bucketName())}
        >
          <Show
            when={bucketInstall.isBucketInstalling(bucketName())}
            fallback={
              <>
                <Download class="w-4 h-4 me-2" aria-hidden="true" />
                {t("common.install")}
              </>
            }
          >
            <LoaderCircle class="w-4 h-4 me-2 animate-spin" aria-hidden="true" />
            {t("common.installing")}
          </Show>
        </button>
      </Show>
      <Show when={isInstalled()}>
        <button
          type="button"
          class="btn btn-error"
          onClick={handleRemoveBucket}
          disabled={bucketInstall.isBucketBusy(bucketName())}
        >
          <Show
            when={bucketInstall.isBucketRemoving(bucketName())}
            fallback={
              <>
                <Trash2 class="w-4 h-4 me-2" aria-hidden="true" />
                {t("common.remove")}
              </>
            }
          >
            <LoaderCircle class="w-4 h-4 me-2 animate-spin" aria-hidden="true" />
            {t("common.removing")}
          </Show>
        </button>
      </Show>
      <button type="button" class="btn-close-outline" onClick={props.onClose}>{t("common.close")}</button>
    </>
  );

  return (
    <Show when={!!props.bucket || !!props.searchBucket}>
      <Modal
        isOpen={!!props.bucket || !!props.searchBucket}
        onClose={props.onClose}
        title={
          <span class="flex items-center gap-2">
            {t("modal.bucket.title", { name: "" })}<span class="text-info font-mono">{props.bucket?.name || props.searchBucket?.name}</span>
          </span>
        }
        size="large"
        headerAction={headerAction}
        footer={footer}
        preventBackdropClose={false}
      >
        <Show when={props.error}>
          <div role="alert" class="alert alert-error mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{props.error}</span>
          </div>
        </Show>
        <Show when={operationError()}>
          <div role="alert" class="alert alert-error mb-4">
            <span>{operationError()}</span>
          </div>
        </Show>
        <Show when={props.bucket || props.searchBucket}>
          <div class="flex flex-col md:flex-row gap-6">
            <div class="flex-1">
              <h4 class="text-lg font-medium mb-3 pb-2 border-b">{t("modal.bucket.details")}</h4>
              <div class="grid grid-cols-1 gap-x-4 gap-y-2 text-sm">
                <Show
                  when={props.bucket && isInstalled()}
                  fallback={
                    // Show basic info for external buckets
                    <Show when={props.searchBucket}>
                      <div class="grid grid-cols-3 gap-2 py-1 border-b border-base-content/10">
                        <div class="font-semibold text-base-content/70 col-span-1">{t("modal.bucket.name")}</div>
                        <div class="col-span-2">{props.searchBucket!.name}</div>
                      </div>
                      <div class="grid grid-cols-3 gap-2 py-1 border-b border-base-content/10">
                        <div class="font-semibold text-base-content/70 col-span-1">{t("modal.bucket.type")}</div>
                        <div class="col-span-2">{t("modal.bucket.gitRepo")}</div>
                      </div>
                      <div class="grid grid-cols-3 gap-2 py-1 border-b border-base-content/10">
                        <div class="font-semibold text-base-content/70 col-span-1">{t("modal.bucket.packages")}</div>
                        <div class="col-span-2">
                          <div class="flex items-center gap-1">
                            <span class="font-bold text-primary">{props.searchBucket!.apps}</span>
                            <span class="text-xs text-base-content/70">{t("buckets.packages")}</span>
                          </div>
                        </div>
                      </div>
                      <div class="grid grid-cols-3 gap-2 py-1 border-b border-base-content/10">
                        <div class="font-semibold text-base-content/70 col-span-1">{t("modal.bucket.repository")}</div>
                        <div class="col-span-2">
                          <a
                            href={props.searchBucket!.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="link link-primary break-all text-xs flex items-center gap-1"
                          >
                            <GitBranch class="w-3 h-3" aria-hidden="true" />
                            {props.searchBucket!.url}
                          </a>
                        </div>
                      </div>
                      <Show when={props.searchBucket!.last_updated !== "Unknown"}>
                        <div class="grid grid-cols-3 gap-2 py-1 border-b border-base-content/10">
                          <div class="font-semibold text-base-content/70 col-span-1">{t("modal.bucket.lastUpdated")}</div>
                          <div class="col-span-2">{formatDate(props.searchBucket!.last_updated)}</div>
                        </div>
                      </Show>
                    </Show>
                  }
                >
                  {/* Show detailed info for installed buckets */}
                  <For each={orderedDetails()}>
                    {([key, value]) => (
                      <div class="grid grid-cols-3 gap-2 py-1 border-b border-base-content/10">
                        <div class="font-semibold text-base-content/70 capitalize col-span-1">
                          {detailLabel(key)}:
                        </div>
                        <div class="col-span-2">
                          <Switch fallback={<DetailValue value={value} />}>
                            <Match when={key === 'Last Updated'}>
                              {formatDate(value as string)}
                            </Match>
                            <Match when={key === 'Path'}>
                              <div class="text-xs font-mono break-all">
                                {value}
                              </div>
                            </Match>
                            <Match when={key === 'Manifests'}>
                              <div class="flex items-center gap-1">
                                <span class="font-bold text-primary">{value}</span>
                                <span class="text-xs text-base-content/70">{t("buckets.packages")}</span>
                              </div>
                            </Match>
                          </Switch>
                        </div>
                      </div>
                    )}
                  </For>

                  <Show when={props.bucket?.git_url}>
                    <div class="grid grid-cols-3 gap-2 py-1 border-b border-base-content/10">
                      <div class="font-semibold text-base-content/70 col-span-1">{t("modal.bucket.repository")}</div>
                      <div class="col-span-2">
                        <a
                          href={props.bucket!.git_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          class="link link-primary break-all text-xs flex items-center gap-1"
                        >
                          <GitBranch class="w-3 h-3" aria-hidden="true" />
                          {props.bucket!.git_url}
                        </a>
                      </div>
                    </div>
                  </Show>
                </Show>
              </div>
            </div>

            <div class="flex-1">
              <Show
                when={isInstalled() && (props.manifests.length > 0 || props.manifestsLoading)}
                fallback={
                  // Show description when bucket is not installed or no manifests available
                  <Show when={props.description && !isInstalled()}>

                    <h4 class="text-lg font-medium mb-3 border-b pb-2">{t("modal.bucket.description")}</h4>
                    <div class="bg-code rounded-lg p-4">
                      <p class="text-sm  leading-relaxed">
                        {props.description}
                      </p>
                    </div>
                  </Show>
                }
              >
                <h4 class="text-lg font-medium mb-3 border-b pb-2 flex items-center gap-2">
                  {t("modal.bucket.availablePackages", { count: props.manifests.length })}
                </h4>
                <div class="bg-base-100 rounded-lg p-3">
                  <ManifestsList
                    manifests={props.manifests}
                    loading={props.manifestsLoading}
                    onPackageClick={(packageName) => props.onPackageClick?.(packageName, props.bucket?.name ?? bucketName())}
                  />
                </div>
              </Show>
            </div>
          </div>
        </Show>
      </Modal>
    </Show>
  );
}

export default BucketInfoModal;

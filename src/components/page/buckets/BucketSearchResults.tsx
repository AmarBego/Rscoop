import { For, Show, createSignal } from "solid-js";
import { SearchableBucket } from "../../../hooks/useBucketSearch";
import { BucketInfo } from "../../../hooks/useBuckets";
import { useBucketInstall } from "../../../hooks/useBucketInstall";
import { ExternalLink, Star, Package, GitFork, Shield, LoaderCircle, TriangleAlert } from "lucide-solid";
import { openUrl } from '@tauri-apps/plugin-opener';
import { useI18n } from "../../../i18n";
import { getErrorMessage } from "../../../utils/errors";

interface BucketSearchResultsProps {
  buckets: SearchableBucket[];
  loading: boolean;
  error: string | null;
  totalCount: number;
  isExpandedSearch: boolean;
  installedBuckets: BucketInfo[];
  onBucketSelect?: (bucket: SearchableBucket) => void;
  onBucketInstalled?: () => void; // Callback when a bucket is installed/removed
}

function BucketSearchResults(props: BucketSearchResultsProps) {
  const { t } = useI18n();
  const bucketInstall = useBucketInstall();
  const [operationError, setOperationError] = createSignal<string | null>(null);
  const formatNumber = (num: number) => {
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'k';
    }
    return num.toString();
  };

  // Check if a bucket is installed locally
  const isBucketInstalled = (bucketName: string) => {
    return props.installedBuckets.some(installed => installed.name === bucketName);
  };

  // Handle bucket installation
  const handleInstallBucket = async (bucket: SearchableBucket, event: Event) => {
    event.stopPropagation();
    setOperationError(null);

    try {
      const result = await bucketInstall.installBucket({
        name: bucket.name,
        url: bucket.url,
        force: false,
      });

      if (result.success) {
        // Call parent callback to refresh bucket list immediately
        console.log('Bucket installed successfully, refreshing bucket list');
        props.onBucketInstalled?.();
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
  const handleRemoveBucket = async (bucketName: string, event: Event) => {
    event.stopPropagation();
    setOperationError(null);

    try {
      const result = await bucketInstall.removeBucket(bucketName);

      if (result.success) {
        // Call parent callback to refresh bucket list immediately
        console.log('Bucket removed successfully, refreshing bucket list');
        props.onBucketInstalled?.();
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

  const openBucket = (bucket: SearchableBucket) => {
    props.onBucketSelect?.(bucket);
  };

  return (
    <div class="space-y-4">
      {/* Header */}
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-bold">
          {t("buckets.searchResults")}
          <Show when={props.buckets.length > 0}>
            <span class="text-base-content/60 ms-2 text-lg font-normal">
              ({props.buckets.length}{props.totalCount > props.buckets.length ? ` of ${props.totalCount}` : ''})
            </span>
          </Show>
        </h2>

        <Show when={props.isExpandedSearch}>
          <div class="badge badge-info badge-outline badge-lg">
            <Shield class="w-3 h-3 me-1" aria-hidden="true" />
            {t("buckets.expandedSearch")}
          </div>
        </Show>
      </div>

      {/* Loading State — cold only */}
      <Show when={props.loading && props.buckets.length === 0}>
        <div class="flex justify-center items-center py-12">
          <span class="loading loading-spinner loading-lg me-3"></span>
          <span class="text-lg">{t("buckets.searching")}</span>
        </div>
      </Show>

      {/* Error State */}
      <Show when={props.error}>
        <div class="alert alert-error">
          <span>{props.error}</span>
        </div>
      </Show>

      <Show when={operationError()}>
        <div role="alert" class="alert alert-error">
          <TriangleAlert class="w-4 h-4" aria-hidden="true" />
          <span>{operationError()}</span>
        </div>
      </Show>

      {/* No Results */}
      <Show when={!props.loading && !props.error && props.buckets.length === 0}>
        <p class="text-sm text-base-content/50 py-8 text-center">{t("buckets.noResults")}</p>
      </Show>

      {/* Results Grid */}
      <Show when={!props.error && props.buckets.length > 0}>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <For each={props.buckets}>
            {(bucket) => (
              <div
                class="bg-base-300 rounded-lg p-4 cursor-pointer hover:bg-base-300/80 transition-colors"
                onClick={() => openBucket(bucket)}
              >
                {/* Header */}
                <div class="flex items-center gap-2 mb-2 min-w-0">
                  <button
                    type="button"
                    class="font-semibold text-lg text-start hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded truncate min-w-0"
                    onClick={() => openBucket(bucket)}
                    title={bucket.name}
                  >
                    {bucket.name}
                  </button>
                  <Show when={bucket.is_verified}>
                    <span class="badge badge-info badge-outline badge-xs">
                      <Shield class="w-2.5 h-2.5 me-0.5" aria-hidden="true" />
                      {t("buckets.verified")}
                    </span>
                  </Show>
                  <button
                    type="button"
                    class="btn btn-ghost btn-xs btn-circle ms-auto"
                    onClick={async (e) => {
                      e.stopPropagation();
                      try { await openUrl(bucket.url); } catch {}
                    }}
                    title={t("buckets.openOnGithub")}
                    aria-label={t("buckets.openOnGithub")}
                  >
                    <ExternalLink class="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>

                {/* Description */}
                <p class="text-s text-base-content/60 line-clamp-2 mb-2 min-h-[2rem]">
                  {bucket.description || t("buckets.noDescription")}
                </p>

                {/* Repo name */}
                <p class="text-xs text-base-content/40 font-mono truncate mb-3">
                  {bucket.full_name}
                </p>

                {/* Stats + action row */}
                <div class="flex items-center gap-4 text-xs text-base-content/50">
                  <span class="flex items-center gap-1">
                    <Star class="w-3 h-3 text-warning" aria-hidden="true" />
                    {formatNumber(bucket.stars)}
                  </span>
                  <span class="flex items-center gap-1">
                    <Package class="w-3 h-3 text-info" aria-hidden="true" />
                    {formatNumber(bucket.apps)}
                  </span>
                  <span class="flex items-center gap-1">
                    <GitFork class="w-3 h-3 text-success" aria-hidden="true" />
                    {formatNumber(bucket.forks)}
                  </span>
                  <span class="ms-auto">
                    <Show
                      when={isBucketInstalled(bucket.name)}
                      fallback={
                        <button
                          type="button"
                          class="btn btn-primary text-xs btn-xs"
                          onClick={(e) => handleInstallBucket(bucket, e)}
                          disabled={bucketInstall.isBucketBusy(bucket.name)}
                        >
                          <Show
                            when={bucketInstall.isBucketInstalling(bucket.name)}
                            fallback={<>{t("common.install")}</>}
                          >
                            <LoaderCircle class="w-3 h-3 animate-spin" aria-hidden="true" />
                            {t("common.installing")}
                          </Show>
                        </button>
                      }
                    >
                      <button
                        type="button"
                        class="btn btn-ghost btn-xs text-xs text-error"
                        onClick={(e) => handleRemoveBucket(bucket.name, e)}
                        disabled={bucketInstall.isBucketBusy(bucket.name)}
                      >
                        <Show
                          when={bucketInstall.isBucketRemoving(bucket.name)}
                          fallback={<>{t("common.remove")}</>}
                        >
                          <LoaderCircle class="w-3 h-3 animate-spin" aria-hidden="true" />
                          {t("common.removing")}
                        </Show>
                      </button>
                    </Show>
                  </span>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

export default BucketSearchResults;

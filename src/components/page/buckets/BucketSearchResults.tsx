import { For, Show } from "solid-js";
import { SearchableBucket } from "../../../hooks/useBucketSearch";
import { BucketInfo } from "../../../hooks/useBuckets";
import { useBucketInstall } from "../../../hooks/useBucketInstall";
import { ExternalLink, Star, Package, GitFork, Shield, LoaderCircle } from "lucide-solid";
import { openUrl } from '@tauri-apps/plugin-opener';

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
  const bucketInstall = useBucketInstall();
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
      }
    } catch (error) {
      console.error('Failed to install bucket:', error);
    }
  };

  // Handle bucket removal
  const handleRemoveBucket = async (bucketName: string, event: Event) => {
    event.stopPropagation();

    try {
      const result = await bucketInstall.removeBucket(bucketName);

      if (result.success) {
        // Call parent callback to refresh bucket list immediately
        console.log('Bucket removed successfully, refreshing bucket list');
        props.onBucketInstalled?.();
      } else {
        console.error('Bucket removal failed:', result.message);
      }
    } catch (error) {
      console.error('Failed to remove bucket:', error);
    }
  };

  return (
    <div class="space-y-4">
      {/* Header */}
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-bold">
          Search Results
          <Show when={!props.loading}>
            <span class="text-base-content/60 ml-2 text-lg font-normal">
              ({props.buckets.length}{props.totalCount > props.buckets.length ? ` of ${props.totalCount}` : ''})
            </span>
          </Show>
        </h2>

        <Show when={props.isExpandedSearch}>
          <div class="badge badge-info badge-outline badge-lg">
            <Shield class="w-3 h-3 mr-1" />
            Expanded Search
          </div>
        </Show>
      </div>

      {/* Loading State */}
      <Show when={props.loading}>
        <div class="flex justify-center items-center py-12">
          <span class="loading loading-spinner loading-lg mr-3"></span>
          <span class="text-lg">Searching buckets...</span>
        </div>
      </Show>

      {/* Error State */}
      <Show when={props.error}>
        <div class="alert alert-error">
          <span>{props.error}</span>
        </div>
      </Show>

      {/* No Results */}
      <Show when={!props.loading && !props.error && props.buckets.length === 0}>
        <p class="text-sm text-base-content/50 py-8 text-center">No buckets found. Try different search terms or enable expanded search.</p>
      </Show>

      {/* Results Grid */}
      <Show when={!props.loading && !props.error && props.buckets.length > 0}>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <For each={props.buckets}>
            {(bucket) => (
              <div
                class="bg-base-300 rounded-lg p-4 cursor-pointer hover:bg-base-300/80 transition-colors"
                onClick={() => props.onBucketSelect?.(bucket)}
              >
                {/* Header */}
                <div class="flex items-center gap-2 mb-2">
                  <span class="font-semibold text-lg truncate">{bucket.name}</span>
                  <Show when={bucket.is_verified}>
                    <span class="badge badge-info badge-outline badge-xs">
                      <Shield class="w-2.5 h-2.5 mr-0.5" />
                      Verified
                    </span>
                  </Show>
                  <button
                    class="btn btn-ghost btn-xs btn-circle ml-auto"
                    onClick={async (e) => {
                      e.stopPropagation();
                      try { await openUrl(bucket.url); } catch {}
                    }}
                    title="Open on GitHub"
                  >
                    <ExternalLink class="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Description */}
                <p class="text-s text-base-content/60 line-clamp-2 mb-2 min-h-[2rem]">
                  {bucket.description || "No description"}
                </p>

                {/* Repo name */}
                <p class="text-xs text-base-content/40 font-mono truncate mb-3">
                  {bucket.full_name}
                </p>

                {/* Stats + action row */}
                <div class="flex items-center gap-4 text-xs text-base-content/50">
                  <span class="flex items-center gap-1">
                    <Star class="w-3 h-3 text-yellow-500" />
                    {formatNumber(bucket.stars)}
                  </span>
                  <span class="flex items-center gap-1">
                    <Package class="w-3 h-3 text-blue-500" />
                    {formatNumber(bucket.apps)}
                  </span>
                  <span class="flex items-center gap-1">
                    <GitFork class="w-3 h-3 text-green-500" />
                    {formatNumber(bucket.forks)}
                  </span>
                  <span class="ml-auto">
                    <Show
                      when={isBucketInstalled(bucket.name)}
                      fallback={
                        <button
                          class="btn btn-primary text-xs btn-xs"
                          onClick={(e) => handleInstallBucket(bucket, e)}
                          disabled={bucketInstall.isBucketBusy(bucket.name)}
                        >
                          <Show
                            when={bucketInstall.isBucketInstalling(bucket.name)}
                            fallback={<>Install</>}
                          >
                            <LoaderCircle class="w-3 h-3 animate-spin" />
                            Installing...
                          </Show>
                        </button>
                      }
                    >
                      <button
                        class="btn btn-ghost btn-xs text-xs text-error"
                        onClick={(e) => handleRemoveBucket(bucket.name, e)}
                        disabled={bucketInstall.isBucketBusy(bucket.name)}
                      >
                        <Show
                          when={bucketInstall.isBucketRemoving(bucket.name)}
                          fallback={<>Remove</>}
                        >
                          <LoaderCircle class="w-3 h-3 animate-spin" />
                          Removing...
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
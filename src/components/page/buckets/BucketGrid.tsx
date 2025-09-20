import { Show, For } from "solid-js";
import { RefreshCw } from "lucide-solid";
import { BucketInfo } from "../../../hooks/useBuckets";
import BucketCard from "./BucketCard";

interface BucketGridProps {
  buckets: BucketInfo[];
  onViewBucket: (bucket: BucketInfo) => void;
  onRefresh?: () => void;
  onUpdateBucket?: (bucketName: string) => void;
  onUpdateAll?: () => void;
  updatingBuckets?: Set<string>;
  updateResults?: {[key: string]: string};
}

function BucketGrid(props: BucketGridProps) {
  return (
    <div class="card bg-base-100">
      <div class="card-body">
        <div class="flex justify-between items-center mb-4">
          <h2 class="card-title">Installed Buckets</h2>
          <Show when={props.onUpdateAll && props.buckets.some(b => b.is_git_repo)}>
            <button 
              class="btn btn-secondary btn-sm gap-2"
              onClick={props.onUpdateAll}
              disabled={props.updatingBuckets && props.updatingBuckets.size > 0}
            >
              <RefreshCw class="w-4 h-4" />
              Update All Git Buckets
            </button>
          </Show>
        </div>
        <Show when={props.buckets.length === 0} fallback={
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <For each={props.buckets}>
              {(bucket) => (
                <BucketCard 
                  bucket={bucket} 
                  onViewBucket={props.onViewBucket}
                  onUpdateBucket={props.onUpdateBucket}
                  isUpdating={props.updatingBuckets?.has(bucket.name) || false}
                  updateResult={props.updateResults?.[bucket.name]}
                />
              )}
            </For>
          </div>
        }>
          <div class="text-center py-8">
            <p class="text-base-content/70">No buckets found</p>
            <p class="text-sm text-base-content/50 mt-2">
              Buckets are typically located in your Scoop installation's buckets directory
            </p>
            <Show when={props.onRefresh}>
              <div class="mt-4">
                <button class="btn btn-primary" onClick={props.onRefresh}>
                  Refresh
                </button>
              </div>
            </Show>
          </div>
        </Show>
      </div>
    </div>
  );
}

export default BucketGrid;
import { Show } from "solid-js";
import { BucketInfo } from "../../../hooks/useBuckets";

interface BucketCardProps {
  bucket: BucketInfo;
  onViewBucket: (bucket: BucketInfo) => void;
}

function BucketCard(props: BucketCardProps) {
  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return "Unknown";
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div 
      class="card bg-base-200 shadow-sm hover:shadow-md hover:bg-base-300 cursor-pointer transition-all duration-200 hover:scale-[1.02] border border-base-300 hover:border-primary/30"
      onClick={() => props.onViewBucket(props.bucket)}
    >
      <div class="card-body p-4">
        <div class="flex items-start justify-between mb-3">
          <h3 class="card-title text-lg font-semibold">{props.bucket.name}</h3>
        </div>
        
        <div class="flex items-center justify-between mb-2">
          <div class="text-sm text-base-content/70">
            <div class="flex items-center gap-1 mb-1">
              <span class="font-bold text-primary text-xl">
                {props.bucket.manifest_count}
              </span>
              <span class="text-sm">packages</span>
            </div>
            <Show when={props.bucket.last_updated}>
              <div class="text-xs text-base-content/50">
                Updated {formatDate(props.bucket.last_updated)}
              </div>
            </Show>
          </div>
          
          <Show when={props.bucket.git_branch}>
            <div class="badge badge-outline badge-sm">
              {props.bucket.git_branch}
            </div>
          </Show>
        </div>
        
        <Show when={props.bucket.git_url}>
          <div class="text-xs text-base-content/40 mt-2 truncate font-mono bg-base-100 px-2 py-1 rounded">
            {props.bucket.git_url}
          </div>
        </Show>
      </div>
    </div>
  );
}

export default BucketCard;
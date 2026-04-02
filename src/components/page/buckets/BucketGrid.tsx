import { Show, For } from "solid-js";
import { Plus, RefreshCw } from "lucide-solid";
import { BucketInfo } from "../../../hooks/useBuckets";
import BucketCard from "./BucketCard";
import { useI18n } from "../../../i18n";

interface BucketGridProps {
  buckets: BucketInfo[];
  onViewBucket: (bucket: BucketInfo) => void;
  onRefresh?: () => void;
  onUpdateBucket?: (bucketName: string) => void;
  onUpdateAll?: () => void;
  onAddBucket?: () => void;
  updatingBuckets?: Set<string>;
  updateResults?: {[key: string]: string};
}

function BucketGrid(props: BucketGridProps) {
  const { t } = useI18n();
  const anyUpdating = () => props.updatingBuckets && props.updatingBuckets.size > 0;

  return (
    <div>
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-lg font-semibold">{t("buckets.installedSection")}</h2>
        <div class="flex items-center gap-2">
          <button
            class="btn btn-ghost btn-s"
            onClick={props.onAddBucket}
          >
            <Plus class="w-3.5 h-3.5" />
            {t("buckets.addBucket")}
          </button>
          <Show when={props.onUpdateAll && props.buckets.some(b => b.is_git_repo)}>
            <button
              class="btn btn-ghost btn-s"
              onClick={props.onUpdateAll}
              disabled={anyUpdating()}
            >
              <RefreshCw class="w-3.5 h-3.5" classList={{ "animate-spin": anyUpdating() }} />
              {t("buckets.updateAll")}
            </button>
          </Show>
        </div>
      </div>
      <Show when={props.buckets.length === 0} fallback={
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
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
        <p class="text-sm text-base-content/50 py-8 text-center">{t("buckets.noBuckets")}</p>
      </Show>
    </div>
  );
}

export default BucketGrid;

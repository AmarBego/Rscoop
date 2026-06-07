import { Show, For } from "solid-js";
import { Plus, RefreshCw, TriangleAlert } from "lucide-solid";
import { BucketInfo } from "../../../hooks/useBuckets";
import BucketCard from "./BucketCard";
import { useI18n } from "../../../i18n";

interface BucketGridProps {
  buckets: BucketInfo[];
  loading?: boolean;
  onViewBucket: (bucket: BucketInfo) => void;
  onRefresh?: () => void;
  onUpdateBucket?: (bucketName: string) => void;
  onUpdateAll?: () => void;
  onAddBucket?: () => void;
  updatingBuckets?: Set<string>;
  updateResults?: {[key: string]: string};
  error?: string | null;
}

function BucketGrid(props: BucketGridProps) {
  const { t } = useI18n();
  const anyUpdating = () => props.updatingBuckets && props.updatingBuckets.size > 0;
  const isColdLoad = () => !!props.loading && props.buckets.length === 0;

  return (
    <div>
      <div class="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h2 class="text-lg font-semibold">{t("buckets.installedSection")}</h2>
        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="btn btn-ghost min-h-11 h-11"
            onClick={props.onAddBucket}
          >
            <Plus class="w-3.5 h-3.5" aria-hidden="true" />
            {t("buckets.addBucket")}
          </button>
          <Show when={props.onUpdateAll && props.buckets.some(b => b.is_git_repo)}>
            <button
              type="button"
              class="btn btn-ghost min-h-11 h-11"
              onClick={props.onUpdateAll}
              disabled={anyUpdating()}
            >
              <RefreshCw class="w-3.5 h-3.5" classList={{ "animate-spin": anyUpdating() }} aria-hidden="true" />
              {t("buckets.updateAll")}
            </button>
          </Show>
        </div>
      </div>
      <Show when={props.error}>
        <div role="alert" class="alert alert-error mb-4">
          <TriangleAlert class="w-4 h-4" aria-hidden="true" />
          <span>{props.error}</span>
        </div>
      </Show>
      <Show when={isColdLoad()}>
        <div class="flex justify-center items-center py-8">
          <span class="loading loading-spinner loading-lg"></span>
          <span class="ms-2">{t("buckets.loading")}</span>
        </div>
      </Show>
      <Show when={!isColdLoad() && props.buckets.length === 0}>
        <p class="text-sm text-base-content/50 py-8 text-center">{t("buckets.noBuckets")}</p>
      </Show>
      <Show when={props.buckets.length > 0}>
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
      </Show>
    </div>
  );
}

export default BucketGrid;

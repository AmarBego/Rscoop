import { Show, createSignal, createEffect, onCleanup } from "solid-js";
import { RefreshCw } from "lucide-solid";
import { BucketInfo } from "../../../hooks/useBuckets";
import { useI18n } from "../../../i18n";

interface BucketCardProps {
  bucket: BucketInfo;
  onViewBucket: (bucket: BucketInfo) => void;
  onUpdateBucket?: (bucketName: string) => void;
  isUpdating?: boolean;
  updateResult?: string;
}

function BucketCard(props: BucketCardProps) {
  const { t } = useI18n();
  const [showOverlay, setShowOverlay] = createSignal(false);
  const [fading, setFading] = createSignal(false);
  let cardRef: HTMLDivElement | undefined;
  let observerRef: IntersectionObserver | undefined;

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return "Unknown";
    return new Date(dateString).toLocaleDateString();
  };

  // Flash overlay only when new manifests arrived
  createEffect(() => {
    if (props.updateResult && !props.isUpdating) {
      setShowOverlay(true);
      setFading(false);

      // Wait until card is visible before fading
      if (cardRef) {
        observerRef?.disconnect();
        observerRef = new IntersectionObserver(
          ([entry]) => {
            if (entry.isIntersecting && showOverlay()) {
              setTimeout(() => {
                setFading(true);
                setTimeout(() => setShowOverlay(false), 1500);
              }, 800);
              observerRef?.disconnect();
            }
          },
          { threshold: 0.5 }
        );
        observerRef.observe(cardRef);
      }
    }
  });

  onCleanup(() => observerRef?.disconnect());

  return (
    <div
      ref={cardRef}
      class="bg-base-300 rounded-lg p-4 cursor-pointer hover:bg-base-300/80 transition-colors relative overflow-hidden"
      onClick={() => props.onViewBucket(props.bucket)}
    >
      {/* Success overlay */}
      <Show when={showOverlay()}>
        <div
          class="absolute inset-0 rounded-lg pointer-events-none bg-success/8 transition-opacity duration-1500"
          classList={{ "opacity-0": fading() }}
        />
      </Show>

      <div class="flex items-start justify-between mb-2">
        <div>
          <h3 class="font-semibold">{props.bucket.name}</h3>
          <div class="flex items-baseline gap-1.5 mt-0.5">
            <span class="text-primary font-bold">{props.bucket.manifest_count}</span>
            <span class="text-xs text-base-content/50">{t("buckets.packages")}</span>
          </div>
        </div>
        <Show when={props.bucket.git_branch}>
          <span class="text-xs text-base-content/40 font-mono">{props.bucket.git_branch}</span>
        </Show>
      </div>

      <div class="flex items-center justify-between mt-1">
        <Show when={props.bucket.last_updated}>
          <span class="text-xs text-base-content/40">{t("buckets.updated", { date: formatDate(props.bucket.last_updated) })}</span>
        </Show>
        <Show when={props.bucket.is_git_repo && props.onUpdateBucket}>
          <button
            class="btn btn-ghost btn-xs text-sm ml-auto"
            onClick={(e) => {
              e.stopPropagation();
              props.onUpdateBucket!(props.bucket.name);
            }}
            disabled={props.isUpdating}
          >
            <RefreshCw class="w-3.5 h-3.5" classList={{ "animate-spin": props.isUpdating }} />
            {t("common.update")}
          </button>
        </Show>
      </div>
    </div>
  );
}

export default BucketCard;

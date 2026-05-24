import { For, Show, Accessor, Setter, createSignal, createEffect, onCleanup } from "solid-js";
import {
  Funnel, LayoutGrid, List, CircleArrowUp, Search, X, CircleCheckBig, CircleAlert, Activity
} from 'lucide-solid';
import { useI18n } from "../../../i18n";
import { Dropdown, DropdownItem, DropdownTitle } from "../../common/Dropdown";

interface InstalledPageHeaderProps {
  updatableCount: Accessor<number>;
  onUpdateAll: () => void;
  onCheckStatus?: () => void;
  statusLoading?: Accessor<boolean>;
  scoopStatus?: Accessor<any>;

  uniqueBuckets: Accessor<string[]>;
  selectedBucket: Accessor<string>;
  setSelectedBucket: Setter<string>;

  viewMode: Accessor<"grid" | "list">;
  setViewMode: Setter<"grid" | "list">;

  isCheckingForUpdates: Accessor<boolean>;
  onCheckForUpdates: () => void;

  searchQuery: Accessor<string>;
  setSearchQuery: Setter<string>;
}

function InstalledPageHeader(props: InstalledPageHeaderProps) {
  const { t } = useI18n();
  const [isSearchOpen, setIsSearchOpen] = createSignal(false);
  let searchInputRef: HTMLInputElement | undefined;

  createEffect(() => {
    if (!isSearchOpen()) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSearchOpen(false);
        props.setSearchQuery("");
      }
    };

    document.addEventListener("keydown", handleEscape);
    onCleanup(() => document.removeEventListener("keydown", handleEscape));
  });

  createEffect(() => {
    if (isSearchOpen()) {
      queueMicrotask(() => searchInputRef?.focus());
    }
  });

  const toggleViewMode = () => {
    props.setViewMode(props.viewMode() === 'grid' ? 'list' : 'grid');
  };

  return (
    <div class="flex justify-between items-center mb-6 h-10">
      <Show
        when={!isSearchOpen()}
        fallback={
          <div class="flex-grow flex items-center gap-2">
            <div class="join w-full">
              <span class="join-item btn btn-disabled bg-base-200 border-none"> <Search class="w-4 h-4" /></span>
              <input
                ref={searchInputRef}
                type="text"
                placeholder={t("installed.searchPlaceholder")}
                aria-label={t("installed.searchTooltip")}
                class="input w-full join-item bg-base-200 focus:outline-none focus:border-base-content/20"
                value={props.searchQuery()}
                onInput={(e) => props.setSearchQuery(e.currentTarget.value)}
              />
            </div>
            <button
              type="button"
              class="btn btn-ghost btn-circle"
              aria-label={t("buckets.clearSearch")}
              onClick={() => {
                setIsSearchOpen(false);
                props.setSearchQuery("");
              }}
            >
              <X class="w-5 h-5" />
            </button>
          </div>
        }
      >
        <h2 class="text-3xl font-bold tracking-tight">{t("installed.title")}</h2>
        <div class="flex items-center gap-2">

          {/* Search Button */}
          <button
            type="button"
            class="btn btn-ghost btn-circle tooltip tooltip-bottom"
            data-tip={t("installed.searchTooltip")}
            aria-label={t("installed.searchTooltip")}
            onClick={() => setIsSearchOpen(true)}
          >
            <Search class="w-5 h-5" />
          </button>

          {/* Update All Button or Status Button */}
          <Show when={props.updatableCount() > 0}
            fallback={
              <button
                type="button"
                class={`btn btn-ghost btn-circle tooltip tooltip-bottom ${props.scoopStatus?.()?.is_everything_ok ? "text-success" : ""}`}
                data-tip={t("installed.checkStatusTooltip")}
                aria-label={t("installed.checkStatusTooltip")}
                onClick={props.onCheckStatus}
                disabled={props.statusLoading?.()}
              >
                <Show when={props.statusLoading?.()}
                  fallback={
                    <Show when={props.scoopStatus?.() !== null && props.scoopStatus?.() !== undefined}
                      fallback={<Activity class="w-4 h-4" />}
                    >
                      <Show when={props.scoopStatus?.()?.is_everything_ok}
                        fallback={<CircleAlert class="w-4 h-4 text-warning" />}
                      >
                        <CircleCheckBig class="w-4 h-4" />
                      </Show>
                    </Show>
                  }
                >
                  <span class="loading loading-spinner loading-sm"></span>
                </Show>
              </button>
            }
          >
            <button type="button" class="btn btn-secondary gap-2" onClick={props.onUpdateAll}>
              <CircleArrowUp class="w-4 h-4" />
              <span>{t("installed.updateAll", { count: props.updatableCount() })}</span>
            </button>
          </Show>

          {/* Filters Dropdown */}
          <Dropdown
            size="lg"
            tone="dark"
            scrollable
            menuWidth="w-56"
            ariaLabel={t("installed.filterTooltip")}
            triggerTooltip={t("installed.filterTooltip")}
            triggerClass="border border-base-100/50"
            trigger={<Funnel class="w-4 h-4" />}
          >
            <DropdownTitle>{t("installed.tableBucket")}</DropdownTitle>
            <For each={props.uniqueBuckets()}>
              {(bucket) => (
                <DropdownItem
                  active={props.selectedBucket() === bucket}
                  onClick={() => props.setSelectedBucket(bucket)}
                >
                  {bucket === 'all' ? t("installed.allBuckets") : bucket}
                </DropdownItem>
              )}
            </For>
          </Dropdown>

          {/* View Toggle Button */}
          <button
            type="button"
            class="btn btn-ghost tooltip tooltip-bottom border border-base-100/50"
            data-tip={props.viewMode() === 'grid' ? t("installed.switchToList") : t("installed.switchToGrid")}
            aria-label={props.viewMode() === 'grid' ? t("installed.switchToList") : t("installed.switchToGrid")}
            onClick={toggleViewMode}
          >
            <Show when={props.viewMode() === 'grid'}>
              <List class="w-4 h-4" />
            </Show>
            <Show when={props.viewMode() === 'list'}>
              <LayoutGrid class="w-4 h-4" />
            </Show>
          </button>
        </div>
      </Show>
    </div>
  );
}

export default InstalledPageHeader;
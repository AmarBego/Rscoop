import { Accessor, Show, createSignal, createEffect, createUniqueId } from "solid-js";
import { Search, X, TriangleAlert, LoaderCircle, ChevronDown } from "lucide-solid";
import { useBucketSearch } from "../../../hooks/useBucketSearch";
import { useI18n } from "../../../i18n";
import Modal from "../../common/Modal";
import { Dropdown, DropdownItem } from "../../common/Dropdown";

interface BucketSearchProps {
  isActive: Accessor<boolean>;
  onToggle: () => void;
  onSearchResults?: (results: any) => void;
}

function BucketSearch(props: BucketSearchProps) {
  const { t } = useI18n();
  const bucketSearch = useBucketSearch();
  const [searchInput, setSearchInput] = createSignal("");
  const [showExpandedDialog, setShowExpandedDialog] = createSignal(false);
  const [expandedInfo, setExpandedInfo] = createSignal<any>(null);
  const [tempDisableChineseBuckets, setTempDisableChineseBuckets] = createSignal(false);
  const [tempMinimumStars, setTempMinimumStars] = createSignal(2);
  const communityChineseId = createUniqueId();
  const communityStarsId = createUniqueId();

  // Input ref to maintain focus
  let inputRef: HTMLInputElement | undefined;

  // Simple search input handler like SearchBar.tsx
  const handleSearchInput = (value: string) => {
    setSearchInput(value);
    bucketSearch.setSearchQuery(value);
  };

  // Load defaults when search becomes active (simple like SearchPage)
  createEffect(() => {
    if (props.isActive() && !searchInput()) {
      bucketSearch.loadDefaults();
    }
  });

  // Watch search results and update parent (simple like SearchPage)
  createEffect(() => {
    if (props.onSearchResults) {
      props.onSearchResults({
        results: bucketSearch.searchResults(),
        totalCount: bucketSearch.totalCount(),
        isSearching: bucketSearch.isSearching(),
        error: bucketSearch.error(),
        isExpandedSearch: bucketSearch.isExpandedSearch(),
      });
    }
  });

  const handleExpandedSearchClick = async () => {
    const info = await bucketSearch.getExpandedSearchInfo();
    if (info) {
      setExpandedInfo(info);
      setShowExpandedDialog(true);
    }
  };

  const confirmExpandedSearch = async () => {
    setShowExpandedDialog(false);
    bucketSearch.setIncludeExpanded(true);
    bucketSearch.setDisableChineseBuckets(tempDisableChineseBuckets());
    bucketSearch.setMinimumStars(tempMinimumStars());
    await bucketSearch.searchBuckets(
      searchInput(),
      true,
      undefined,
      undefined,
      tempDisableChineseBuckets(),
      tempMinimumStars()
    );
  };

  const closeSearch = () => {
    bucketSearch.clearSearch();
    setSearchInput("");
    bucketSearch.setSortBy("stars"); // Reset to stars sorting when closing search
    props.onToggle();
  };

  return (
    <>
      {/* Search Button */}
      <Show when={!props.isActive()}>
        <button
          type="button"
          onClick={props.onToggle}
          class="btn btn-ghost btn-sm gap-2"
          aria-label={t("buckets.searchAriaLabel")}
        >
          <Search class="h-4 w-4" aria-hidden="true" />
          {t("buckets.discoverNew")}
        </button>
      </Show>

      <Show when={props.isActive()}>
        <div class="flex flex-col gap-4 w-full bg-base-100 p-4 rounded-lg border border-base-300">
          {/* Search Input Row */}
          <div class="flex flex-wrap items-center gap-3">
            <div class="relative flex-1">
              <span class="absolute inset-y-0 left-0 flex items-center pl-3 z-10">
                <Show when={!bucketSearch.isSearching()} fallback={
                  <LoaderCircle class="h-5 w-5 text-base-content/40 animate-spin" aria-hidden="true" />
                }>
                  <Search class="h-5 w-5 text-base-content/40" aria-hidden="true" />
                </Show>
              </span>

              <input
                ref={inputRef}
                type="text"
                placeholder={t("buckets.searchPlaceholder")}
                aria-label={t("buckets.searchPlaceholder")}
                class="input w-full pl-10 pr-10 bg-base-300 transition-colors duration-200 focus:outline-none focus:border-base-content/20"
                value={searchInput()}
                onInput={(e) => handleSearchInput(e.currentTarget.value)}
              />

              <Show when={searchInput().length > 0}>
                <button
                  type="button"
                  onClick={() => handleSearchInput("")}
                  class="absolute inset-y-0 right-0 flex items-center pr-3 text-base-content/40 hover:text-base-content"
                  aria-label={t("buckets.clearSearch")}
                >
                  <X class="h-4 w-4" aria-hidden="true" />
                </button>
              </Show>
            </div>

            <button
              type="button"
              onClick={closeSearch}
              class="btn btn-ghost btn-sm"
              aria-label={t("buckets.closeSearch")}
            >
              {t("common.close")}
            </button>
          </div>

          {/* Search Options Row */}
          <div class="flex flex-wrap items-center justify-between gap-4 text-sm">
            <div class="flex flex-wrap items-center gap-4 min-w-0">
              {/* Sort Options */}
              <div class="flex items-center gap-2">
                <span class="text-base-content/70">{t("buckets.sortBy")}</span>
                {(() => {
                  const sortOptions: { value: string; labelKey: string }[] = [
                    { value: "stars", labelKey: "buckets.sortStars" },
                    { value: "relevance", labelKey: "buckets.sortRelevance" },
                    { value: "apps", labelKey: "buckets.sortApps" },
                    { value: "name", labelKey: "buckets.sortName" },
                  ];
                  const currentLabel = () => {
                    const match = sortOptions.find(o => o.value === bucketSearch.sortBy());
                    return match ? t(match.labelKey) : bucketSearch.sortBy();
                  };
                  const setSort = async (value: string) => {
                    bucketSearch.setSortBy(value);
                    if (searchInput().trim()) {
                      await bucketSearch.searchBuckets(searchInput());
                    }
                    inputRef?.focus();
                  };
                  return (
                    <Dropdown
                      ariaLabel={t("buckets.sortBy")}
                      triggerClass="border border-base-content/20"
                      menuWidth="w-40"
                      trigger={<><span>{currentLabel()}</span><ChevronDown class="w-4 h-4 opacity-60" aria-hidden="true" /></>}
                    >
                      {sortOptions.map((opt) => (
                        <DropdownItem
                          active={bucketSearch.sortBy() === opt.value}
                          onClick={() => setSort(opt.value)}
                        >
                          {t(opt.labelKey)}
                        </DropdownItem>
                      ))}
                    </Dropdown>
                  );
                })()}
              </div>

              {/* Results Count */}
              <Show when={bucketSearch.searchResults().length > 0}>
                <div class="text-base-content/70">
                  {t("buckets.resultsCount", { count: bucketSearch.searchResults().length, total: bucketSearch.totalCount() })}
                </div>
              </Show>
            </div>

            {/* Expanded Search Controls */}
            <div class="flex items-center gap-2">
              <Show when={!bucketSearch.cacheExists() && !bucketSearch.isExpandedSearch()}>
                <button
                  type="button"
                  onClick={async () => {
                    await handleExpandedSearchClick();
                  }}
                  class="btn btn-sm btn-outline btn-warning"
                  disabled={bucketSearch.isSearching()}
                >
                  <TriangleAlert class="h-4 w-4 mr-1" aria-hidden="true" />
                  {t("buckets.communityBuckets")}
                </button>
              </Show>

              <Show when={bucketSearch.cacheExists() || bucketSearch.isExpandedSearch()}>
                <button
                  type="button"
                  onClick={async () => {
                    await bucketSearch.disableExpandedSearch();
                    // The effect will handle updating parent results
                  }}
                  class="btn btn-sm btn-outline btn-error"
                  disabled={bucketSearch.isSearching()}
                  title={t("buckets.disableCommunityTooltip")}
                >
                  <X class="h-4 w-4 mr-1" aria-hidden="true" />
                  {t("buckets.disableCommunity")}
                </button>
              </Show>
            </div>
          </div>

          {/* Error Display */}
          <Show when={bucketSearch.error()}>
            <div class="alert alert-error alert-sm">
              <TriangleAlert class="h-4 w-4" aria-hidden="true" />
              <span>{bucketSearch.error()}</span>
            </div>
          </Show>
        </div>
      </Show>

      {/* Expanded Search Confirmation Dialog */}
      <Modal
        isOpen={showExpandedDialog()}
        onClose={() => setShowExpandedDialog(false)}
        title={t("buckets.communityDialogTitle")}
        size="small"
        footer={
          <div class="flex flex-wrap justify-end gap-2 w-full">
            <button
              type="button"
              class="btn btn-ghost"
              onClick={() => setShowExpandedDialog(false)}
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              class="btn btn-primary"
              onClick={confirmExpandedSearch}
              disabled={bucketSearch.isSearching()}
            >
              {t("buckets.enable")}
            </button>
          </div>
        }
      >
            <p class="text-sm text-base-content/70 mb-4">
              {t("buckets.communityDialogText", { totalBuckets: expandedInfo()?.total_buckets?.toLocaleString(), sizeMb: expandedInfo()?.estimated_size_mb })}
            </p>

            {/* Filters */}
            <div class="space-y-3 mb-6">
              <div class="flex items-center justify-between">
                <label class="text-sm" for={communityChineseId}>{t("buckets.excludeChinese")}</label>
                <input
                  id={communityChineseId}
                  type="checkbox"
                  class="toggle toggle-primary"
                  checked={tempDisableChineseBuckets()}
                  onChange={(e) => setTempDisableChineseBuckets(e.currentTarget.checked)}
                />
              </div>
              <div class="flex items-center justify-between">
                <label class="text-sm" for={communityStarsId}>{t("buckets.minimumStars")}</label>
                <input
                  id={communityStarsId}
                  type="number"
                  class="input input-sm w-20 focus:outline-none focus:border-base-content/20"
                  min="0"
                  max="1000"
                  value={tempMinimumStars()}
                  onInput={(e) => setTempMinimumStars(parseInt(e.currentTarget.value) || 0)}
                />
              </div>
            </div>
      </Modal>
    </>
  );
}

export default BucketSearch;

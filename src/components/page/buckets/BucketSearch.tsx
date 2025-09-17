import { Accessor, Show, createSignal, createEffect } from "solid-js";
import { Search, X, AlertTriangle, Loader2 } from "lucide-solid";
import { useBucketSearch } from "../../../hooks/useBucketSearch";

interface BucketSearchProps {
  isActive: Accessor<boolean>;
  onToggle: () => void;
  onSearchResults?: (results: any) => void;
}

function BucketSearch(props: BucketSearchProps) {
  const bucketSearch = useBucketSearch();
  const [searchInput, setSearchInput] = createSignal("");
  const [showExpandedDialog, setShowExpandedDialog] = createSignal(false);
  const [expandedInfo, setExpandedInfo] = createSignal<any>(null);
  const [tempDisableChineseBuckets, setTempDisableChineseBuckets] = createSignal(false);
  const [tempMinimumStars, setTempMinimumStars] = createSignal(2);

  // Handle search input changes with debouncing (like SearchPage)
  let debounceTimer: number;
  const handleSearchInput = (value: string) => {
    setSearchInput(value);
    bucketSearch.setSearchQuery(value);
    
    // Auto-switch sorting: relevance when searching, stars when not searching
    if (value.trim()) {
      // Has search query - switch to relevance if not already set
      if (bucketSearch.sortBy() === "stars") {
        bucketSearch.setSortBy("relevance");
      }
    } else {
      // No search query - switch to stars for best defaults
      bucketSearch.setSortBy("stars");
    }
    
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      bucketSearch.debouncedSearch(value);
    }, 300);
    
    // Pass results to parent immediately when input changes
    updateParentResults();
  };

  // Load defaults when search becomes active
  createEffect(() => {
    if (props.isActive()) {
      // Always load defaults when search becomes active and there's no search input
      if (!searchInput()) {
        bucketSearch.loadDefaults().then(() => {
          updateParentResults();
        });
      } else {
        // If there's already a search input, make sure to update parent with current results
        updateParentResults();
      }
    }
  });

  // Update parent with current results
  const updateParentResults = () => {
    if (props.onSearchResults) {
      props.onSearchResults({
        results: bucketSearch.searchResults(),
        totalCount: bucketSearch.totalCount(),
        isSearching: bucketSearch.isSearching(),
        error: bucketSearch.error(),
        isExpandedSearch: bucketSearch.isExpandedSearch(),
      });
    }
  };

  // Watch for changes in search results and update parent
  createEffect(() => {
    updateParentResults();
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
      <div class="flex items-center gap-2">
        <Show when={!props.isActive()}>
          <button
            onClick={props.onToggle}
            class="btn btn-circle btn-outline hover:btn-primary transition-all duration-200"
            aria-label="Search buckets"
          >
            <Search class="h-5 w-5" />
          </button>
        </Show>
      </div>

      {/* Search Bar - Slides in from top */}
      <div class={`absolute top-0 left-0 right-0 transition-all duration-300 ease-in-out z-50 ${
        props.isActive() 
          ? 'opacity-100 translate-y-0 pointer-events-auto' 
          : 'opacity-0 -translate-y-4 pointer-events-none'
      }`}>
        {/* Backdrop to ensure search bar stands out */}
        <div class="absolute inset-0 bg-base-100/80 backdrop-blur-sm -z-10 rounded-lg"></div>
        
        <div class="flex flex-col gap-4 mb-4 bg-base-100 p-4 rounded-lg shadow-xl border border-base-300 relative">
          {/* Search Input Row */}
          <div class="flex items-center gap-4">
            <div class="relative flex-1">
              <span class="absolute inset-y-0 left-0 flex items-center pl-3 z-10">
                <Show when={!bucketSearch.isSearching()} fallback={
                  <Loader2 class="h-5 w-5 text-primary animate-spin" />
                }>
                  <Search class="h-5 w-5 text-gray-400" />
                </Show>
              </span>

              <input
                type="text"
                placeholder="Search buckets by name..."
                class="input input-bordered w-full pl-10 pr-4 focus:input-primary"
                value={searchInput()}
                onInput={(e) => handleSearchInput(e.currentTarget.value)}
                disabled={bucketSearch.isSearching()}
                autofocus={props.isActive()}
              />
            </div>
            
            <Show when={searchInput().length > 0}>
              <button
                onClick={() => handleSearchInput("")}
                class="btn btn-circle btn-sm btn-ghost hover:btn-error"
                aria-label="Clear search"
                disabled={bucketSearch.isSearching()}
              >
                <X class="h-4 w-4" />
              </button>
            </Show>
            
            <button
              onClick={closeSearch}
              class="btn btn-circle btn-outline hover:btn-error transition-colors"
              aria-label="Close search"
            >
              <X class="h-5 w-5" />
            </button>
          </div>

          {/* Search Options Row */}
          <div class="flex items-center justify-between gap-4 text-sm">
            <div class="flex items-center gap-4">
              {/* Sort Options */}
              <div class="flex items-center gap-2">
                <span class="text-base-content/70">Sort by:</span>
                <select 
                  class="select select-sm select-bordered"
                  value={bucketSearch.sortBy()}
                  onChange={(e) => {
                    bucketSearch.setSortBy(e.currentTarget.value);
                    if (searchInput()) {
                      bucketSearch.searchBuckets();
                    }
                  }}
                >
                  <option value="stars">Stars</option>
                  <option value="relevance">Relevance</option>
                  <option value="apps">Apps</option>
                  <option value="name">Name</option>
                </select>
              </div>

              {/* Results Count */}
              <Show when={bucketSearch.searchResults().length > 0 && !bucketSearch.isSearching()}>
                <div class="text-base-content/70">
                  {bucketSearch.searchResults().length} of {bucketSearch.totalCount()} buckets
                  <Show when={bucketSearch.isExpandedSearch()}>
                    <span class="text-primary ml-1">(expanded)</span>
                  </Show>
                </div>
              </Show>
            </div>

            {/* Expanded Search Controls */}
            <div class="flex items-center gap-2">
              <Show when={!bucketSearch.cacheExists() && !bucketSearch.isExpandedSearch()}>
                <button
                  onClick={async () => {
                    await handleExpandedSearchClick();
                  }}
                  class="btn btn-sm btn-outline btn-warning"
                  disabled={bucketSearch.isSearching()}
                >
                  <AlertTriangle class="h-4 w-4 mr-1" />
                  Search All Buckets
                </button>
              </Show>
              
              <Show when={bucketSearch.cacheExists() || bucketSearch.isExpandedSearch()}>
                <button
                  onClick={async () => {
                    const success = await bucketSearch.disableExpandedSearch();
                    if (success) {
                      updateParentResults();
                    }
                  }}
                  class="btn btn-sm btn-outline btn-error"
                  disabled={bucketSearch.isSearching()}
                  title="Clear expanded search cache and return to verified buckets only"
                >
                  <X class="h-4 w-4 mr-1" />
                  Disable Expanded Search
                </button>
              </Show>
            </div>
          </div>

          {/* Error Display */}
          <Show when={bucketSearch.error()}>
            <div class="alert alert-error alert-sm">
              <AlertTriangle class="h-4 w-4" />
              <span>{bucketSearch.error()}</span>
            </div>
          </Show>
        </div>
      </div>

      {/* Expanded Search Confirmation Dialog */}
      <Show when={showExpandedDialog()}>
        <div class="modal modal-open backdrop-blur-sm">
          <div class="modal-box">
            <h3 class="font-bold text-lg mb-4">Expand Search to All Buckets</h3>
            
            <Show when={expandedInfo()}>
              <div class="space-y-4">
                <div class="flex items-center gap-2 text-warning">
                  <AlertTriangle class="h-5 w-5" />
                  <span class="font-medium">Large Dataset Warning</span>
                </div>
                
                <div class="bg-base-200 p-4 rounded-lg space-y-2">
                  <div class="flex justify-between">
                    <span>Estimated download size:</span>
                    <span class="font-bold">{expandedInfo()?.estimated_size_mb} MB</span>
                  </div>
                  <div class="flex justify-between">
                    <span>Total buckets:</span>
                    <span class="font-bold">~{expandedInfo()?.total_buckets}</span>
                  </div>
                </div>
                
                <p class="text-sm text-base-content/70 break-words">
                  {expandedInfo()?.description}
                </p>

                <div class="bg-blue-50 dark:bg-blue-950 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
                  <p class="text-sm text-blue-800 dark:text-blue-200">
                    <strong>✨ Performance Optimization:</strong> The 14MB markdown file is downloaded, parsed into an optimized 0.3-3MB cache, then deleted. 
                    Subsequent searches will be lightning-fast with zero network requests and minimal memory usage!
                  </p>
                </div>

                <div class="bg-yellow-50 dark:bg-yellow-950 p-3 rounded-lg">
                  <p class="text-sm text-yellow-800 dark:text-yellow-200">
                    <strong>Note:</strong> This will download ~14MB initially, but only ~4MB will be stored permanently as optimized cache. 
                    The search will include community buckets of varying quality and maintenance levels.
                    After the initial download, all searches will be instant and offline-capable.
                  </p>
                </div>
                
                {/* Filter Options */}
                <div class="bg-base-200 p-4 rounded-lg space-y-2">
                  <div class="flex justify-between items-center">
                    <span class="font-bold">Filter Options</span>
                  </div>
                  
                  {/* Disable Chinese Buckets */}
                  <div class="flex justify-between items-center">
                    <span class="text-sm">Disable Chinese Buckets</span>
                    <input 
                      type="checkbox" 
                      class="checkbox checkbox-primary" 
                      checked={tempDisableChineseBuckets()}
                      onChange={(e) => setTempDisableChineseBuckets(e.currentTarget.checked)}
                    />
                  </div>
                  
                  {/* Minimum Star Limit */}
                  <div class="flex justify-between items-center">
                    <span class="text-sm">Minimum Star Limit</span>
                    <input 
                      type="number" 
                      class="input input-bordered input-sm w-20" 
                      min="0"
                      max="1000"
                      value={tempMinimumStars()}
                      onInput={(e) => setTempMinimumStars(parseInt(e.currentTarget.value) || 0)}
                    />
                  </div>
                </div>
              </div>
            </Show>

            <div class="modal-action">
              <button 
                class="btn btn-outline" 
                onClick={() => setShowExpandedDialog(false)}
              >
                Cancel
              </button>
              <button 
                class="btn btn-warning" 
                onClick={confirmExpandedSearch}
                disabled={bucketSearch.isSearching()}
              >
                Enable Expanded Search
              </button>
            </div>
          </div>
          <div class="modal-backdrop" onClick={() => setShowExpandedDialog(false)}></div>
        </div>
      </Show>
    </>
  );
}

export default BucketSearch;
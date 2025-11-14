import { For, Show, Accessor, Setter, createSignal, createEffect, onCleanup } from "solid-js";
import { 
  Filter, Eye, LayoutGrid, List, ArrowUpCircle, Search, X, CheckCircle, AlertCircle, RefreshCw
} from 'lucide-solid';

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
  
  onRefresh: () => void;
}

function InstalledPageHeader(props: InstalledPageHeaderProps) {
  const [isSearchOpen, setIsSearchOpen] = createSignal(false);
  let searchContainerRef: HTMLDivElement | undefined;
  let searchInputRef: HTMLInputElement | undefined;

  createEffect(() => {
    if (!isSearchOpen()) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('[data-no-close-search]')) {
        return;
      }

      if (searchContainerRef && !searchContainerRef.contains(event.target as Node)) {
        setIsSearchOpen(false);
        props.setSearchQuery("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    onCleanup(() => document.removeEventListener("mousedown", handleClickOutside));
  });

  createEffect(() => {
    if (isSearchOpen()) {
      setTimeout(() => searchInputRef?.focus(), 50);
    }
  });

  // 切换视图模式的函数
  const toggleViewMode = () => {
    props.setViewMode(props.viewMode() === 'grid' ? 'list' : 'grid');
  };

  return (
    <div class="flex justify-between items-center mb-6 h-10">
      <Show
        when={!isSearchOpen()}
        fallback={
          <div ref={searchContainerRef} class="flex-grow flex items-center gap-2">
            <div class="join w-full">
              <span class="join-item btn btn-disabled bg-base-200 border-none"> <Search class="w-4 h-4" /></span>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search by name..."
                class="input input-bordered w-full join-item bg-base-200"
                value={props.searchQuery()}
                onInput={(e) => props.setSearchQuery(e.currentTarget.value)}
              />
            </div>
            <button class="btn btn-ghost btn-circle" onClick={() => {
              setIsSearchOpen(false);
              props.setSearchQuery("");
            }}>
              <X class="w-5 h-5" />
            </button>
          </div>
        }
      >
        <h2 class="text-3xl font-bold tracking-tight">Installed Packages</h2>
        <div class="flex items-center gap-2">
          {/* Refresh Button */}
          <button 
            class="btn btn-ghost btn-circle tooltip tooltip-bottom" 
            data-tip="Refresh"
            onClick={props.onRefresh}
          >
            <RefreshCw class="w-5 h-5" />
          </button>
          
          {/* Search Button */}
          <button class="btn btn-ghost btn-circle tooltip tooltip-bottom" data-tip="Search" onClick={() => setIsSearchOpen(true)}>
            <Search class="w-5 h-5" />
          </button>

          {/* Update All Button or Status Button */}
          <Show when={props.updatableCount() > 0}
            fallback={
              <button 
                class="btn btn-ghost btn-circle tooltip tooltip-bottom" 
                data-tip="Check Status"
                onClick={props.onCheckStatus}
                disabled={props.statusLoading?.()}
              >
                <Show when={props.statusLoading?.()}
                  fallback={
                    <Show when={props.scoopStatus?.()?.is_everything_ok}
                      fallback={<AlertCircle class="w-4 h-4" />}
                    >
                      <CheckCircle class="w-4 h-4" />
                    </Show>
                  }
                >
                  <span class="loading loading-spinner loading-sm"></span>
                </Show>
              </button>
            }
          >
            <button class="btn btn-secondary gap-2" onClick={props.onUpdateAll}>
              <ArrowUpCircle class="w-4 h-4" />
              <span class="hidden md:inline">Update All&nbsp;</span>
              <span>({props.updatableCount()})</span>
            </button>
          </Show>

          {/* Filters Dropdown */}
          <div class="dropdown dropdown-end">
            <label tabindex="0" class="btn btn-ghost tooltip tooltip-bottom border border-base-100/50" data-tip="Filter">
              <Filter class="w-4 h-4" />
            </label>
            <div tabindex="0" class="dropdown-content menu p-4 shadow bg-base-300 rounded-box w-64 z-[1]">
              <div class="form-control">
                <label class="label">
                  <span class="label-text">Bucket</span>
                </label>
                <select
                  class="select select-bordered bg-base-300"
                  value={props.selectedBucket()}
                  onChange={(e) => props.setSelectedBucket(e.currentTarget.value)}
                >
                  <For each={props.uniqueBuckets()}>
                    {(bucket) => (
                      <option value={bucket}>{bucket === 'all' ? 'All Buckets' : bucket}</option>
                    )}
                  </For>
                </select>
              </div>
            </div>
          </div>

          {/* View Toggle Button */}
          <button 
            class="btn btn-ghost tooltip tooltip-bottom border border-base-100/50" 
            data-tip={props.viewMode() === 'grid' ? 'Switch to List View' : 'Switch to Grid View'}
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
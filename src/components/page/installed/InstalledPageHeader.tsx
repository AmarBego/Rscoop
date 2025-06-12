import { For, Show, Accessor, Setter, createSignal, createEffect, onCleanup } from "solid-js";
import { 
  Filter, Eye, LayoutGrid, List, ArrowUpCircle, Search, X
} from 'lucide-solid';

interface InstalledPageHeaderProps {
  updatableCount: Accessor<number>;
  onUpdateAll: () => void;

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
  const [isSearchOpen, setIsSearchOpen] = createSignal(false);
  let searchContainerRef: HTMLDivElement | undefined;

  createEffect(() => {
    if (!isSearchOpen()) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef && !searchContainerRef.contains(event.target as Node)) {
        setIsSearchOpen(false);
        props.setSearchQuery("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    onCleanup(() => document.removeEventListener("mousedown", handleClickOutside));
  });

  return (
    <div class="flex justify-between items-center mb-6 h-10">
      <Show
        when={!isSearchOpen()}
        fallback={
          <div ref={searchContainerRef} class="flex-grow flex items-center gap-2">
            <div class="join w-full">
              <span class="join-item btn btn-disabled bg-base-200 border-none"> <Search class="w-4 h-4" /></span>
              <input
                type="text"
                placeholder="Search by name..."
                class="input input-bordered w-full join-item bg-base-200"
                value={props.searchQuery()}
                onInput={(e) => props.setSearchQuery(e.currentTarget.value)}
                autofocus
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
          {/* Search Button */}
          <button class="btn btn-ghost btn-circle" onClick={() => setIsSearchOpen(true)}>
            <Search class="w-5 h-5" />
          </button>

          {/* Update All Button */}
          <Show when={props.updatableCount() > 0}>
            <button class="btn btn-primary gap-2" onClick={props.onUpdateAll}>
              <ArrowUpCircle class="w-4 h-4" />
              <span class="hidden md:inline">Update All&nbsp;</span>
              <span>({props.updatableCount()})</span>
            </button>
          </Show>

          {/* Filters Dropdown */}
          <div class="dropdown dropdown-end">
            <label tabindex="0" class="btn btn-ghost gap-2">
              <Filter class="w-4 h-4" />
              <span class="hidden md:inline">Filter</span>
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

          {/* View Options Dropdown */}
          <div class="dropdown dropdown-end">
            <label tabindex="0" class="btn btn-ghost gap-2">
              <Eye class="w-4 h-4" />
              <span class="hidden md:inline">View</span>
            </label>
            <ul tabindex="0" class="dropdown-content menu p-2 shadow bg-base-300 rounded-box w-40 z-[1]">
              <li>
                <a classList={{ 'bg-base-200': props.viewMode() === 'list' }} onClick={() => props.setViewMode('list')}>
                  <List class="w-4 h-4 mr-2" />
                  List
                </a>
              </li>
              <li>
                <a classList={{ 'bg-base-200': props.viewMode() === 'grid' }} onClick={() => props.setViewMode('grid')}>
                  <LayoutGrid class="w-4 h-4 mr-2" />
                  Grid
                </a>
              </li>
            </ul>
          </div>
        </div>
      </Show>
    </div>
  );
}

export default InstalledPageHeader; 
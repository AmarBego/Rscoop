import { createSignal, onMount, For, Show, createMemo } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { Trash2, Archive, RefreshCw, AlertTriangle, Inbox } from "lucide-solid";
import { formatBytes } from "../../../utils/format";

interface CacheEntry {
    name: string;
    version: string;
    length: number; 
}

// A unique identifier for a cache entry
type CacheIdentifier = string; 

function getCacheIdentifier(entry: CacheEntry): CacheIdentifier {
    // Using length as part of the key for uniqueness, as multiple files can exist for the same version
    return `${entry.name}@${entry.version}:${entry.length}`;
}

interface CacheManagerProps {
    onRunOperation: (title: string, command: Promise<any>) => void;
    isOperationRunning: boolean;
}

function CacheManager(props: CacheManagerProps) {
    const [cacheContents, setCacheContents] = createSignal<CacheEntry[]>([]);
    const [selectedItems, setSelectedItems] = createSignal<Set<CacheIdentifier>>(new Set());
    const [isLoading, setIsLoading] = createSignal(true);
    const [error, setError] = createSignal<string | null>(null);

    const isAllSelected = createMemo(() => 
        cacheContents().length > 0 && selectedItems().size === cacheContents().length
    );

    const fetchCacheContents = async () => {
        setIsLoading(true);
        setError(null);
        setSelectedItems(new Set<CacheIdentifier>());
        try {
            const result = await invoke<CacheEntry[]>("list_cache_contents");
            setCacheContents(result);
        } catch (err) {
            console.error("Failed to fetch cache contents:", err);
            setError(typeof err === 'string' ? err : "An unknown error occurred while fetching cache contents.");
        } finally {
            setIsLoading(false);
        }
    };

    onMount(fetchCacheContents);

    const toggleSelection = (identifier: CacheIdentifier) => {
        setSelectedItems(prev => {
            const next = new Set(prev);
            if (next.has(identifier)) {
                next.delete(identifier);
            } else {
                next.add(identifier);
            }
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (isAllSelected()) {
            setSelectedItems(new Set<CacheIdentifier>());
        } else {
            const allIdentifiers = cacheContents().map(getCacheIdentifier);
            setSelectedItems(new Set<CacheIdentifier>(allIdentifiers));
        }
    };

    const handleClearSelected = () => {
        const packageNames = new Set(
            [...selectedItems()].map(id => id.split('@')[0])
        );

        props.onRunOperation(
            `Clearing cache for ${packageNames.size} package(s)...`,
            invoke("clear_cache", { packages: [...packageNames] }).finally(fetchCacheContents)
        );
    };
    
    const handleClearAll = () => {
        props.onRunOperation(
            "Clearing all package cache...",
            invoke("clear_cache", { packages: [] }).finally(fetchCacheContents)
        );
    };

    return (
        <div class="card bg-base-200 shadow-xl">
            <div class="card-body">
                <div class="flex items-center justify-between mb-4">
                    <h2 class="card-title text-xl">
                        Cache Manager
                    </h2>
                    <div class="flex items-center gap-2">
                        <button 
                            class="btn btn-ghost btn-sm"
                            onClick={fetchCacheContents} 
                            disabled={isLoading() || props.isOperationRunning}
                        >
                            <RefreshCw classList={{"animate-spin": isLoading()}} />
                        </button>
                    </div>
                </div>

                <Show when={error()}>
                    <div role="alert" class="alert alert-error">
                        <AlertTriangle />
                        <span>{error()}</span>
                    </div>
                </Show>

                <Show when={!isLoading() && cacheContents().length === 0 && !error()}>
                    <div class="text-center p-8">
                        <Inbox class="w-16 h-16 mx-auto text-base-content/30" />
                        <p class="mt-4 text-lg font-semibold">Cache is Empty</p>
                        <p class="text-base-content/60">There are no cached package files to manage.</p>
                    </div>
                </Show>

                <Show when={cacheContents().length > 0}>
                    <div class="flex items-center justify-end gap-4 mb-4">
                        <button 
                            class="btn btn-warning btn-sm"
                            onClick={handleClearSelected}
                            disabled={selectedItems().size === 0 || props.isOperationRunning}
                        >
                            <Trash2 class="w-4 h-4 mr-2" />
                            Remove Selected ({selectedItems().size})
                        </button>
                        <button 
                            class="btn btn-error btn-sm"
                            onClick={handleClearAll}
                            disabled={props.isOperationRunning}
                        >
                            <Archive class="w-4 h-4 mr-2" />
                            Remove All
                        </button>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="table table-sm">
                            <thead>
                                <tr>
                                    <th>
                                        <label>
                                            <input 
                                                type="checkbox" 
                                                class="checkbox checkbox-primary"
                                                checked={isAllSelected()}
                                                onChange={toggleSelectAll}
                                            />
                                        </label>
                                    </th>
                                    <th>Name</th>
                                    <th>Version</th>
                                    <th>Size</th>
                                </tr>
                            </thead>
                            <tbody>
                                <For each={cacheContents()}>
                                    {(item) => {
                                        const id = getCacheIdentifier(item);
                                        return (
                                            <tr class="hover">
                                                <td>
                                                    <label>
                                                        <input 
                                                            type="checkbox" 
                                                            class="checkbox checkbox-primary"
                                                            checked={selectedItems().has(id)}
                                                            onChange={() => toggleSelection(id)}
                                                        />
                                                    </label>
                                                </td>
                                                <td>{item.name}</td>
                                                <td>{item.version}</td>
                                                <td>{formatBytes(item.length)}</td>
                                            </tr>
                                        );
                                    }}
                                </For>
                            </tbody>
                        </table>
                    </div>
                </Show>
            </div>
        </div>
    );
}

export default CacheManager; 
import { createSignal, onMount, For, Show, createMemo } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, AlertTriangle, Inbox, Trash2, Link, Globe, EyeOff } from "lucide-solid";

interface Shim {
    name: string;
    path: string;
    source: string;
    shimType: string;
    isGlobal: boolean;
    isHidden: boolean;
}

interface ShimManagerProps {
    onRunOperation: (title: string, command: Promise<any>) => void;
    isOperationRunning: boolean;
}

function ShimManager(props: ShimManagerProps) {
    const [allShims, setAllShims] = createSignal<Shim[]>([]);
    const [filter, setFilter] = createSignal("");
    const [isLoading, setIsLoading] = createSignal(true);
    const [error, setError] = createSignal<string | null>(null);

    const filteredShims = createMemo(() => {
        const f = filter().toLowerCase();
        if (!f) return allShims();
        return allShims().filter(s => 
            s.name.toLowerCase().includes(f) || 
            s.source.toLowerCase().includes(f)
        );
    });

    const fetchShims = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const result = await invoke<Shim[]>("list_shims");
            setAllShims(result.sort((a, b) => a.name.localeCompare(b.name)));
        } catch (err) {
            console.error("Failed to fetch shims:", err);
            setError(typeof err === 'string' ? err : "An unknown error occurred while fetching shims.");
        } finally {
            setIsLoading(false);
        }
    };

    onMount(fetchShims);

    const handleRemoveShim = (shimName: string) => {
        props.onRunOperation(
            `Removing shim: ${shimName}...`,
            invoke("remove_shim", { shimName }).finally(fetchShims)
        );
    };

    return (
        <div class="card bg-base-200 shadow-xl">
            <div class="card-body">
                 <div class="flex items-center justify-between mb-4">
                    <h2 class="card-title text-xl">
                        Shim Manager
                    </h2>
                     <button 
                        class="btn btn-ghost btn-sm"
                        onClick={fetchShims} 
                        disabled={isLoading() || props.isOperationRunning}
                    >
                        <RefreshCw classList={{"animate-spin": isLoading()}} />
                    </button>
                </div>

                <input
                    type="text"
                    placeholder="Filter by name or source..."
                    class="input input-bordered w-full mb-4"
                    value={filter()}
                    onInput={(e) => setFilter(e.currentTarget.value)}
                    disabled={isLoading() || !!error()}
                />

                <Show when={error()}>
                    <div role="alert" class="alert alert-error"><AlertTriangle /><span>{error()}</span></div>
                </Show>

                <Show when={!isLoading() && allShims().length === 0 && !error()}>
                    <div class="text-center p-8">
                        <Inbox class="w-16 h-16 mx-auto text-base-content/30" />
                        <p class="mt-4 text-lg font-semibold">No Shims Found</p>
                    </div>
                </Show>

                <Show when={filteredShims().length > 0}>
                    <div class="overflow-x-auto">
                        <table class="table table-sm">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Source Package</th>
                                    <th>Attributes</th>
                                    <th />
                                </tr>
                            </thead>
                            <tbody>
                                <For each={filteredShims()}>
                                    {(item) => (
                                        <tr class="hover">
                                            <td class="font-mono text-sm">{item.name}</td>
                                            <td>
                                                <div class="flex items-center gap-2">
                                                    <Link class="w-4 h-4 text-base-content/60" />
                                                    {item.source}
                                                </div>
                                            </td>
                                            <td>
                                                <div class="flex gap-2">
                                                    <Show when={item.isGlobal}>
                                                        <div class="badge badge-info gap-1"><Globe class="w-3 h-3"/>Global</div>
                                                    </Show>
                                                    <Show when={item.isHidden}>
                                                         <div class="badge badge-ghost gap-1"><EyeOff class="w-3 h-3"/>Hidden</div>
                                                    </Show>
                                                </div>
                                            </td>
                                            <td class="text-right">
                                                <button
                                                    class="btn btn-error btn-xs"
                                                    onClick={() => handleRemoveShim(item.name)}
                                                    disabled={props.isOperationRunning}
                                                >
                                                    <Trash2 class="w-3 h-3" /> Remove
                                                </button>
                                            </td>
                                        </tr>
                                    )}
                                </For>
                            </tbody>
                        </table>
                    </div>
                </Show>
            </div>
        </div>
    );
}

export default ShimManager; 
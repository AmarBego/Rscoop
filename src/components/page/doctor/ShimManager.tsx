import { createSignal, onMount, For, Show, createMemo } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, TriangleAlert, Inbox, Link, EyeOff, Plus, BookText } from "lucide-solid";
import ShimDetailsModal from "./ShimDetailsModal";
import AddShimModal from "./AddShimModal";

export interface Shim {
    name: string;
    path: string;
    source: string;
    shimType: string;
    args?: string;
    isHidden: boolean;
}

function ShimManager() {
    const [allShims, setAllShims] = createSignal<Shim[]>([]);
    const [filter, setFilter] = createSignal("");
    const [isLoading, setIsLoading] = createSignal(true);
    const [isProcessing, setIsProcessing] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);
    const [selectedShim, setSelectedShim] = createSignal<Shim | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = createSignal(false);

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

    const handleAddShim = async (name: string, path: string, args: string) => {
        setIsProcessing(true);
        try {
            await invoke("add_shim", { args: { name, path, args } });
            await fetchShims();
            setIsAddModalOpen(false);
        } catch (err) {
            console.error(`Failed to add shim ${name}:`, err);
            // Optionally, set an error message to display to the user
        } finally {
            setIsProcessing(false);
        }
    }

    const handleRemoveShim = async (shimName: string) => {
        setIsProcessing(true);
        try {
            await invoke("remove_shim", { shimName });
            await fetchShims();
            setSelectedShim(null);
        } catch (err) {
            console.error(`Failed to remove shim ${shimName}:`, err);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleAlterShim = async (shimName: string) => {
        setIsProcessing(true);
        try {
            await invoke("alter_shim", { shimName });
            await fetchShims();

            const currentlySelected = selectedShim();
            if (currentlySelected && currentlySelected.name === shimName) {
                const newShims = allShims();
                const updatedShim = newShims.find(s => s.name === shimName);
                setSelectedShim(updatedShim || null);
            } else {
                setSelectedShim(null);
            }

        } catch (err) {
            console.error(`Failed to alter shim ${shimName}:`, err);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div class="card bg-base-200 shadow-xl">
            <div class="card-body">
                <div class="flex items-center justify-between mb-4">
                    <h2 class="card-title text-xl">
                        Shim Manager
                    </h2>
                    <div class="flex items-center gap-2">
                        <button
                            class="btn btn-primary btn-sm"
                            onClick={() => setIsAddModalOpen(true)}
                            disabled={isLoading() || isProcessing()}
                        >
                            <Plus class="w-4 h-4" /> Add Shim
                        </button>
                        <div class="divider divider-horizontal m-1" />
                        <button
                            class="btn btn-ghost btn-sm"
                            onClick={fetchShims}
                            disabled={isLoading() || isProcessing()}
                        >
                            <RefreshCw classList={{ "animate-spin": isLoading() }} />
                        </button>
                    </div>
                </div>

                <input
                    type="text"
                    placeholder="Filter by name or source..."
                    class="input input-bordered w-full mb-4"
                    value={filter()}
                    onInput={(e) => setFilter(e.currentTarget.value)}
                    disabled={isLoading() || !!error() || allShims().length === 0}
                />

                <div class="max-h-[60vh] overflow-y-auto">


                    <Show when={error()}>
                        <div role="alert" class="alert alert-error"><TriangleAlert /><span>{error()}</span></div>
                    </Show>

                    <Show when={!isLoading() && allShims().length === 0 && !error()}>
                        <div class="text-center p-8">
                            <Inbox class="w-16 h-16 mx-auto text-base-content/30" />
                            <p class="mt-4 text-lg font-semibold">No Shims Found</p>
                        </div>
                    </Show>

                    <Show when={filteredShims().length > 0}>
                        <div class="overflow-x-auto">
                            {/* TODO: sticky header, cant figure it out for the life of me */}
                            <table class="table table-sm">
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Source Package</th>
                                        <th>Attributes</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <For each={filteredShims()}>
                                        {(item) => (
                                            <tr class="hover cursor-pointer" onClick={() => setSelectedShim(item)}>
                                                <td class="font-mono text-sm">{item.name}</td>
                                                <td>
                                                    <div class="flex items-center gap-2">
                                                        <Link class="w-4 h-4 text-base-content/60" />
                                                        {item.source}
                                                    </div>
                                                </td>
                                                <td>
                                                    <div class="flex gap-2">
                                                        <Show when={item.isHidden}>
                                                            <div class="badge badge-ghost gap-1"><EyeOff class="w-3 h-3" />Hidden</div>
                                                        </Show>
                                                        <Show when={item.args}>
                                                            <div class="badge badge-accent gap-1"><BookText class="w-3 h-3" />Args</div>
                                                        </Show>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </For>
                                </tbody>
                            </table>
                        </div>
                    </Show>

                    <Show when={selectedShim()}>
                        <ShimDetailsModal
                            shim={selectedShim()!}
                            onClose={() => setSelectedShim(null)}
                            onRemove={handleRemoveShim}
                            onAlter={handleAlterShim}
                            isOperationRunning={isProcessing()}
                        />
                    </Show>

                    <Show when={isAddModalOpen()}>
                        <AddShimModal
                            onClose={() => setIsAddModalOpen(false)}
                            onAdd={handleAddShim}
                            isOperationRunning={isProcessing()}
                        />
                    </Show>
                </div>
            </div>
        </div>
    );
}

export default ShimManager; 
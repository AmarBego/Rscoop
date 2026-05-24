import { createSignal, onMount, For, Show, createMemo } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, TriangleAlert, Link, EyeOff, Plus, BookText } from "lucide-solid";
import ShimDetailsModal from "./ShimDetailsModal";
import AddShimModal from "./AddShimModal";
import Card from "../../common/Card";
import { useI18n } from "../../../i18n";

export interface Shim {
    name: string;
    path: string;
    source: string;
    shimType: string;
    args?: string;
    isHidden: boolean;
}

function ShimManager() {
    const { t } = useI18n();
    const [allShims, setAllShims] = createSignal<Shim[]>([]);
    const [filter, setFilter] = createSignal("");
    const [isLoading, setIsLoading] = createSignal(true);
    const [isProcessing, setIsProcessing] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);
    const [mutationError, setMutationError] = createSignal<string | null>(null);
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
            setError(typeof err === 'string' ? err : t("common.unknownError"));
        } finally {
            setIsLoading(false);
        }
    };

    onMount(fetchShims);

    const handleAddShim = async (name: string, path: string, args: string, global: boolean) => {
        setIsProcessing(true);
        setMutationError(null);
        try {
            await invoke("add_shim", { args: { name, path, args, global } });
            await fetchShims();
            setIsAddModalOpen(false);
        } catch (err) {
            console.error(`Failed to add shim ${name}:`, err);
            setMutationError(typeof err === 'string' ? err : t("common.unknownError"));
        } finally {
            setIsProcessing(false);
        }
    }

    const handleRemoveShim = async (shimName: string) => {
        setIsProcessing(true);
        setMutationError(null);
        try {
            await invoke("remove_shim", { shimName });
            await fetchShims();
            setSelectedShim(null);
        } catch (err) {
            console.error(`Failed to remove shim ${shimName}:`, err);
            setMutationError(typeof err === 'string' ? err : t("common.unknownError"));
        } finally {
            setIsProcessing(false);
        }
    };

    const handleAlterShim = async (shimName: string) => {
        setIsProcessing(true);
        setMutationError(null);
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
            setMutationError(typeof err === 'string' ? err : t("common.unknownError"));
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <Card
            title={t("doctor.shimTitle")}
            headerAction={
                <div class="flex items-center gap-2">
                    <button
                        type="button"
                        class="btn btn-ghost btn-xs text-sm"
                        onClick={() => {
                            setMutationError(null);
                            setIsAddModalOpen(true);
                        }}
                        disabled={isLoading() || isProcessing()}
                    >
                        <Plus class="w-3.5 h-3.5" aria-hidden="true" /> {t("doctor.shimAdd")}
                    </button>
                    <button
                        type="button"
                        class="btn btn-ghost btn-xs text-sm"
                        onClick={fetchShims}
                        disabled={isLoading() || isProcessing()}
                        aria-label={t("common.refresh")}
                    >
                        <RefreshCw class="w-3.5 h-3.5" classList={{ "animate-spin": isLoading() }} aria-hidden="true" />
                    </button>
                </div>
            }
        >
            <input
                type="text"
                placeholder={t("doctor.shimFilterPlaceholder")}
                aria-label={t("doctor.shimFilterPlaceholder")}
                class="input input-sm w-full mb-3 bg-base-100 focus:outline-none focus:border-base-content/20"
                value={filter()}
                onInput={(e) => setFilter(e.currentTarget.value)}
                disabled={isLoading() || !!error() || allShims().length === 0}
            />

            <div class="max-h-[60vh] overflow-y-auto">


                <Show when={error()}>
                    <div role="alert" class="alert alert-error"><TriangleAlert aria-hidden="true" /><span>{error()}</span></div>
                </Show>

                <Show when={!isLoading() && allShims().length === 0 && !error()}>
                    <p class="text-sm text-base-content/50 py-4 text-center">{t("doctor.shimNone")}</p>
                </Show>

                <div class="overflow-x-auto">
                    {/* TODO: sticky header, cant figure it out for the life of me */}
                    <table class="table table-sm">
                        <thead>
                            <tr>
                                <th>{t("doctor.shimTableName")}</th>
                                <th>{t("doctor.shimTableSource")}</th>
                                <th>{t("doctor.shimTableAttributes")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <For each={filteredShims()}>
                                {(item) => (
                                    <tr
                                        class="hover cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                                        tabindex="0"
                                        role="button"
                                        aria-label={t("doctor.shimRowLabel", { name: item.name })}
                                        onClick={() => setSelectedShim(item)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" || e.key === " ") {
                                                e.preventDefault();
                                                setSelectedShim(item);
                                            }
                                        }}
                                    >
                                        <td class="font-mono text-sm">{item.name}</td>
                                        <td>
                                            <div class="flex items-center gap-2">
                                                <Link class="w-4 h-4 text-base-content/60" aria-hidden="true" />
                                                {item.source}
                                            </div>
                                        </td>
                                        <td>
                                            <div class="flex gap-2">
                                                <Show when={item.isHidden}>
                                                    <div class="badge badge-ghost gap-1"><EyeOff class="w-3 h-3" aria-hidden="true" />{t("doctor.shimHidden")}</div>
                                                </Show>
                                                <Show when={item.args}>
                                                    <div class="badge badge-accent gap-1"><BookText class="w-3 h-3" aria-hidden="true" />{t("doctor.shimArgs")}</div>
                                                </Show>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </For>
                        </tbody>
                    </table>
                </div>

                <Show when={selectedShim()}>
                    <ShimDetailsModal
                        shim={selectedShim()!}
                        onClose={() => {
                            setMutationError(null);
                            setSelectedShim(null);
                        }}
                        onRemove={handleRemoveShim}
                        onAlter={handleAlterShim}
                        isOperationRunning={isProcessing()}
                        error={mutationError()}
                    />
                </Show>

                <Show when={isAddModalOpen()}>
                    <AddShimModal
                        onClose={() => {
                            setMutationError(null);
                            setIsAddModalOpen(false);
                        }}
                        onAdd={handleAddShim}
                        isOperationRunning={isProcessing()}
                        error={mutationError()}
                    />
                </Show>
            </div>
        </Card>
    );
}

export default ShimManager;

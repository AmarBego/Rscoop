import { createSignal, onMount, For, Show, createMemo } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { Trash2, RefreshCw, TriangleAlert } from "lucide-solid";
import { formatBytes } from "../../../utils/format";
import ConfirmationModal from "../../ConfirmationModal";
import Card from "../../common/Card";
import { useI18n } from "../../../i18n";

interface CacheEntry {
    name: string;
    version: string;
    length: number;
    fileName: string;
}

// A unique identifier for a cache entry
type CacheIdentifier = string;

function getCacheIdentifier(entry: CacheEntry): CacheIdentifier {
    // Using the full filename for uniqueness
    return entry.fileName;
}

function CacheManager() {
    const { t } = useI18n();
    const [cacheContents, setCacheContents] = createSignal<CacheEntry[]>([]);
    const [selectedItems, setSelectedItems] = createSignal<Set<CacheIdentifier>>(new Set());
    const [filter, setFilter] = createSignal("");
    const [isLoading, setIsLoading] = createSignal(true);
    const [error, setError] = createSignal<string | null>(null);

    // State for the confirmation modal
    const [isConfirmModalOpen, setIsConfirmModalOpen] = createSignal(false);
    const [confirmationDetails, setConfirmationDetails] = createSignal({
        onConfirm: () => { },
        title: "",
        content: null as any,
    });

    const filteredCacheContents = createMemo(() => {
        const f = filter().toLowerCase();
        if (!f) return cacheContents();
        return cacheContents().filter(s =>
            s.name.toLowerCase().includes(f) ||
            s.version.toLowerCase().includes(f)
        );
    });

    const isAllSelected = createMemo(() => {
        const contents = filteredCacheContents();
        if (contents.length === 0) return false;
        return contents.every(item => selectedItems().has(getCacheIdentifier(item)));
    });

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
        const currentItems = filteredCacheContents();
        const currentIdentifiers = new Set(currentItems.map(getCacheIdentifier));

        // If all currently visible items are selected, unselect them.
        // Otherwise, select all currently visible items.
        const allVisibleSelected = currentItems.every(item => selectedItems().has(getCacheIdentifier(item)));

        if (allVisibleSelected && currentItems.length > 0) {
            // Unselect only the visible items
            setSelectedItems(prev => {
                const next = new Set(prev);
                currentIdentifiers.forEach(id => next.delete(id));
                return next;
            });
        } else {
            // Select all visible items, adding to any existing selection
            setSelectedItems(prev => new Set([...prev, ...currentIdentifiers]));
        }
    };

    const handleClearSelected = () => {
        const selectedFiles = [...selectedItems()];
        if (selectedFiles.length === 0) return;

        const packageNames = Array.from(new Set(
            selectedFiles.map(id => id.split('@')[0])
        )).sort();

        setConfirmationDetails({
            title: t("doctor.cacheConfirmTitle"),
            content: (
                <>
                    <p>{t("doctor.cacheConfirmSelected", { count: String(selectedFiles.length), packageCount: String(packageNames.length) })}</p>
                    <ul class="list-disc list-inside bg-base-100 p-2 rounded-md max-h-40 overflow-y-auto">
                        <For each={packageNames}>{(name) => <li>{name}</li>}</For>
                    </ul>
                    <p>{t("doctor.cacheCannotUndo")}</p>
                </>
            ),
            onConfirm: async () => {
                setIsLoading(true);
                try {
                    await invoke("clear_cache", { files: selectedFiles });
                } catch (err) {
                    console.error("Failed to clear selected cache items:", err);
                    setError(typeof err === 'string' ? err : "An unknown error occurred while clearing cache.");
                } finally {
                    await fetchCacheContents();
                }
            }
        });

        setIsConfirmModalOpen(true);
    };

    const handleClearAll = () => {
        setConfirmationDetails({
            title: t("doctor.cacheConfirmTitle"),
            content: <p>{t("doctor.cacheConfirmAll", { count: String(cacheContents().length) })}</p>,
            onConfirm: async () => {
                setIsLoading(true);
                try {
                    await invoke("clear_cache", { files: null });
                } catch (err) {
                    console.error("Failed to clear all cache items:", err);
                    setError(typeof err === 'string' ? err : "An unknown error occurred while clearing cache.");
                } finally {
                    await fetchCacheContents();
                }
                setIsConfirmModalOpen(false);
            }
        });

        setIsConfirmModalOpen(true);
    };

    return (
        <>
            <Card
                title={t("doctor.cacheTitle")}
                headerAction={
                    <div class="flex items-center gap-2">
                        <Show when={cacheContents().length > 0}>
                            <Show when={selectedItems().size > 0}>
                                <button
                                    class="btn btn-ghost btn-xs text-sm text-warning"
                                    onClick={handleClearSelected}
                                    disabled={isLoading()}
                                >
                                    <Trash2 class="w-3.5 h-3.5" />
                                    {t("doctor.cacheRemoveSelected", { count: String(selectedItems().size) })}
                                </button>
                            </Show>
                            <button
                                class="btn btn-ghost btn-xs text-sm text-error"
                                onClick={handleClearAll}
                                disabled={isLoading()}
                            >
                                {t("doctor.cacheRemoveAll")}
                            </button>
                        </Show>
                        <button
                            class="btn btn-ghost btn-xs"
                            onClick={fetchCacheContents}
                            disabled={isLoading()}
                        >
                            <RefreshCw class="w-3.5 h-3.5" classList={{ "animate-spin": isLoading() }} />
                        </button>
                    </div>
                }
            >
                <input
                    type="text"
                    placeholder={t("doctor.cacheFilterPlaceholder")}
                    class="input input-bordered input-sm w-full mb-3 bg-base-100"
                    value={filter()}
                    onInput={(e) => setFilter(e.currentTarget.value)}
                    disabled={isLoading() || !!error() || cacheContents().length === 0}
                />

                <div class="max-h-[60vh] overflow-y-auto">
                    <Show when={error()}>
                        <div role="alert" class="alert alert-error">
                            <TriangleAlert />
                            <span>{error()}</span>
                        </div>
                    </Show>

                    <Show when={!isLoading() && cacheContents().length === 0 && !error()}>
                        <p class="text-sm text-base-content/50 py-4 text-center">{t("doctor.cacheNone")}</p>
                    </Show>

                    <Show when={cacheContents().length > 0}>
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
                                        <th>{t("doctor.cacheTableName")}</th>
                                        <th>{t("doctor.cacheTableVersion")}</th>
                                        <th>{t("doctor.cacheTableSize")}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <For each={filteredCacheContents()}>
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
            </Card>

            <ConfirmationModal
                isOpen={isConfirmModalOpen()}
                title={confirmationDetails().title}
                confirmText={t("common.delete")}
                onConfirm={() => {
                    confirmationDetails().onConfirm();
                    setIsConfirmModalOpen(false);
                }}
                onCancel={() => setIsConfirmModalOpen(false)}
            >
                {confirmationDetails().content}
            </ConfirmationModal>
        </>
    );
}

export default CacheManager;
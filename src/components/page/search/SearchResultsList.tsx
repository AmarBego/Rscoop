import { For, Show, createSignal } from "solid-js";
import { ScoopPackage } from "../../../types/scoop";
import { Download, Check } from "lucide-solid";
import { useI18n } from "../../../i18n";

interface SearchResultsListProps {
    loading: boolean;
    results: ScoopPackage[];
    searchTerm: string;
    activeTab: "packages" | "includes";
    onViewInfo: (pkg: ScoopPackage) => void;
    onInstall: (pkg: ScoopPackage) => void;
    onPackageStateChanged?: () => void;
}

function SearchResultsList(props: SearchResultsListProps) {
    const { t } = useI18n();
    const [queued, setQueued] = createSignal<Set<string>>(new Set());

    const flashQueued = (name: string) => {
        setQueued(prev => new Set([...prev, name]));
        setTimeout(() => setQueued(prev => {
            const next = new Set(prev);
            next.delete(name);
            return next;
        }), 1500);
    };

    return (
        <>
            <Show when={props.loading && props.results.length === 0}>
                <div class="flex justify-center items-center h-64">
                    <span class="loading loading-spinner loading-lg"></span>
                </div>
            </Show>

            <Show
                when={!props.loading && props.results.length === 0 && props.searchTerm.length > 1}
            >
                <div class="text-center py-16">
                    <p class="text-xl">
                        {t("search.noResults", { type: props.activeTab === "packages" ? "packages" : "includes", term: props.searchTerm })}
                    </p>
                </div>
            </Show>

            <div
                role="tabpanel"
                id={`search-tab-${props.activeTab}-panel`}
                aria-labelledby={`search-tab-${props.activeTab}-btn`}
                class="space-y-2"
            >
                <For each={props.results}>
                    {(pkg) => (
                        <div
                            role="button"
                            tabindex="0"
                            aria-label={pkg.name}
                            onClick={() => props.onViewInfo(pkg)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    props.onViewInfo(pkg);
                                }
                            }}
                            class="bg-base-300 hover:bg-base-400 rounded-lg p-3 transition-colors cursor-pointer flex items-start justify-between gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                        >
                            <div class="min-w-0 flex-1">
                                <h3 class="font-medium text-base truncate" title={pkg.name}>{pkg.name}</h3>
                                <p class="text-xs text-base-content/60 mt-0.5 truncate">
                                    {t("search.fromBucket", { source: pkg.source })}
                                </p>
                            </div>
                            <div class="flex items-center gap-2 shrink-0">
                                <span class="badge badge-primary badge-soft">{pkg.version}</span>
                                <Show when={pkg.is_installed} fallback={
                                    <button
                                        type="button"
                                        class="btn btn-sm btn-ghost"
                                        classList={{ "text-success": queued().has(pkg.name) }}
                                        disabled={queued().has(pkg.name)}
                                        aria-label={queued().has(pkg.name) ? t("common.queued") : t("common.install")}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            props.onInstall(pkg);
                                            props.onPackageStateChanged?.();
                                            flashQueued(pkg.name);
                                        }}
                                    >
                                        <Show when={queued().has(pkg.name)} fallback={<Download class="w-4 h-4" aria-hidden="true" />}>
                                            <Check class="w-4 h-4" aria-hidden="true" />
                                        </Show>
                                    </button>
                                }>
                                    <span class="badge badge-success">{t("search.installedBadge")}</span>
                                </Show>
                            </div>
                        </div>
                    )}
                </For>
            </div>
        </>
    );
}

export default SearchResultsList;

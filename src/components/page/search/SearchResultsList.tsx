import { For, Show, createSignal } from "solid-js";
import { ScoopPackage } from "../../../types/scoop";
import { Download, Check } from "lucide-solid";
import Card from "../../common/Card";
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
            <Show when={props.loading}>
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

            <div class="space-y-4">
                <For each={props.results}>
                    {(pkg) => (
                        <div onClick={() => props.onViewInfo(pkg)}>
                            <Card
                                class="cursor-pointer transition-all duration-200 transform hover:scale-101"
                                title={
                                    <div class="flex flex-col gap-0">
                                        <span class="text-base font-semibold">{pkg.name}</span>
                                        <span class="text-sm font-normal text-base-content/70">
                                            {t("search.fromBucket", { source: pkg.source })}
                                        </span>
                                    </div>
                                }
                                headerAction={
                                    <div class="flex items-center gap-2">
                                        <span class="badge badge-primary badge-soft">
                                            {pkg.version}
                                        </span>
                                        {pkg.is_installed ? (
                                            <span class="badge badge-success">{t("search.installedBadge")}</span>
                                        ) : (
                                            <button
                                                class="btn btn-sm btn-ghost"
                                                classList={{ "text-success": queued().has(pkg.name) }}
                                                disabled={queued().has(pkg.name)}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    props.onInstall(pkg);
                                                    props.onPackageStateChanged?.();
                                                    flashQueued(pkg.name);
                                                }}
                                            >
                                                <Show when={queued().has(pkg.name)} fallback={<Download />}>
                                                    <Check />
                                                </Show>
                                            </button>
                                        )}
                                    </div>
                                }
                            />
                        </div>
                    )}
                </For>
            </div>
        </>
    );
}

export default SearchResultsList;
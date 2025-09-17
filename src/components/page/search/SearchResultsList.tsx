import { For, Show } from "solid-js";
import { ScoopPackage } from "../../../types/scoop";
import { Download } from "lucide-solid";

interface SearchResultsListProps {
    loading: boolean;
    results: ScoopPackage[];
    searchTerm: string;
    activeTab: "packages" | "includes";
    onViewInfo: (pkg: ScoopPackage) => void;
    onInstall: (pkg: ScoopPackage) => void;
    onPackageStateChanged?: () => void; // Callback for when package state changes
}

function SearchResultsList(props: SearchResultsListProps) {
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
                        No {props.activeTab === "packages" ? "packages" : "includes"} found
                        for "{props.searchTerm}"
                    </p>
                </div>
            </Show>

            <div class="space-y-4">
                <For each={props.results}>
                    {(pkg) => (
                        <div
                            class="card bg-base-200 shadow-xl cursor-pointer transition-all duration-200 transform hover:scale-101"
                            onClick={() => props.onViewInfo(pkg)}
                        >
                            <div class="card-body">
                                <div class="flex justify-between items-start">
                                    <div class="flex-grow">
                                        <h3 class="card-title">{pkg.name}</h3>
                                        <p>
                                            from bucket: <strong>{pkg.source}</strong>
                                        </p>
                                    </div>
                                    <div class="flex-shrink-0 ml-4 text-right flex items-center gap-2">
                                        <span class="badge badge-primary badge-soft">
                                            {pkg.version}
                                        </span>
                                        {pkg.is_installed ? (
                                            <span class="badge badge-success">Installed</span>
                                        ) : (
                                            <button
                                                class="btn btn-sm btn-ghost"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    props.onInstall(pkg);
                                                    // Notify parent that package state may change
                                                    props.onPackageStateChanged?.();
                                                }}
                                            >
                                                <Download />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </For>
            </div>
        </>
    );
}

export default SearchResultsList;
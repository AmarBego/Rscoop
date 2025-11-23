import { For, Show } from "solid-js";
import { ScoopPackage } from "../../../types/scoop";
import { Download } from "lucide-solid";
import Card from "../../common/Card";

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
                        <div onClick={() => props.onViewInfo(pkg)}>
                            <Card
                                class="cursor-pointer transition-all duration-200 transform hover:scale-101"
                                title={
                                    <div class="flex flex-col gap-0">
                                        <span class="text-base font-semibold">{pkg.name}</span>
                                        <span class="text-sm font-normal text-base-content/70">
                                            from bucket: <strong>{pkg.source}</strong>
                                        </span>
                                    </div>
                                }
                                headerAction={
                                    <div class="flex items-center gap-2">
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
                                                    props.onPackageStateChanged?.();
                                                }}
                                            >
                                                <Download />
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
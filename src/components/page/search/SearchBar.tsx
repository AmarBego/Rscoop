import { Accessor, Setter, Show } from "solid-js";
import { CircleQuestionMark, Search, X, LoaderCircle } from "lucide-solid";
import { useI18n } from "../../../i18n";

interface SearchBarProps {
    searchTerm: Accessor<string>;
    setSearchTerm: Setter<string>;
    loading?: Accessor<boolean>;
}

function SearchBar(props: SearchBarProps) {
    const { t } = useI18n();
    return (
        <div class="relative w-full">
            <span class="absolute inset-y-0 left-0 flex items-center pl-3 z-10">
                <Show when={props.loading?.()} fallback={<Search class="h-5 w-5 text-base-content/50" aria-hidden="true" />}>
                    <LoaderCircle class="h-5 w-5 text-base-content/50 animate-spin" aria-hidden="true" />
                </Show>
            </span>

            <input
                type="search"
                placeholder={t("search.placeholder")}
                aria-label={t("search.placeholder")}
                class="input bg-base-400 w-full pl-10 pr-16 relative focus:outline-none focus:border-base-content/20 [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
                value={props.searchTerm()}
                onInput={(e) => props.setSearchTerm(e.currentTarget.value)}
            />

            <div class="absolute inset-y-0 right-0 flex items-center pr-3 space-x-2">
                <Show when={props.searchTerm().length > 0}>
                    <button
                        type="button"
                        onClick={() => props.setSearchTerm("")}
                        class="p-1 -mr-1 rounded-full text-base-content/60 hover:text-base-content hover:bg-base-content/10 focus:outline-none"
                        aria-label={t("search.clearLabel")}
                    >
                        <X class="h-5 w-5" aria-hidden="true" />
                    </button>
                </Show>
                <span
                    class="tooltip tooltip-left"
                    data-tip={t("search.exactMatchTooltip")}
                    role="img"
                    aria-label={t("search.exactMatchTooltip")}
                >
                    <CircleQuestionMark class="w-4 h-4 text-base-content/50" aria-hidden="true" />
                </span>
            </div>
        </div>
    );
}

export default SearchBar;

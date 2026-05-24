import { Accessor, Setter } from "solid-js";
import { useI18n } from "../../../i18n";

type SearchTab = "packages" | "includes";

interface SearchResultsTabsProps {
    activeTab: Accessor<SearchTab>;
    setActiveTab: Setter<SearchTab>;
    packageCount: number;
    includesCount: number;
}

function SearchResultsTabs(props: SearchResultsTabsProps) {
    const { t } = useI18n();

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        const next: SearchTab = props.activeTab() === "packages" ? "includes" : "packages";
        props.setActiveTab(next);
        queueMicrotask(() => {
            document.getElementById(`search-tab-${next}-btn`)?.focus();
        });
    };

    return (
        <div role="tablist" class="tabs tabs-border my-6" onKeyDown={handleKeyDown}>
            <button
                type="button"
                role="tab"
                id="search-tab-packages-btn"
                aria-selected={props.activeTab() === "packages"}
                aria-controls="search-tab-packages-panel"
                class="tab"
                classList={{ "tab-active": props.activeTab() === "packages" }}
                onClick={() => props.setActiveTab("packages")}
            >
                {t("search.packagesTab", { count: props.packageCount })}
            </button>
            <button
                type="button"
                role="tab"
                id="search-tab-includes-btn"
                aria-selected={props.activeTab() === "includes"}
                aria-controls="search-tab-includes-panel"
                class="tab"
                classList={{ "tab-active": props.activeTab() === "includes" }}
                onClick={() => props.setActiveTab("includes")}
            >
                {t("search.includesTab", { count: props.includesCount })}
            </button>
        </div>
    );
}

export default SearchResultsTabs;

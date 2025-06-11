import { Accessor, Setter } from "solid-js";

interface SearchResultsTabsProps {
    activeTab: Accessor<"packages" | "includes">;
    setActiveTab: Setter<"packages" | "includes">;
    packageCount: number;
    includesCount: number;
}

function SearchResultsTabs(props: SearchResultsTabsProps) {
    return (
        <div class="tabs tabs-border my-6">
            <a
                class="tab"
                classList={{ "tab-active": props.activeTab() === "packages" }}
                onClick={() => props.setActiveTab("packages")}
            >
                Packages ({props.packageCount})
            </a>
            <a
                class="tab"
                classList={{ "tab-active": props.activeTab() === "includes" }}
                onClick={() => props.setActiveTab("includes")}
            >
                Includes ({props.includesCount})
            </a>
        </div>
    );
}

export default SearchResultsTabs;
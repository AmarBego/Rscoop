import { Accessor, Setter } from "solid-js";
import { useI18n } from "../../../i18n";

interface SearchResultsTabsProps {
    activeTab: Accessor<"packages" | "includes">;
    setActiveTab: Setter<"packages" | "includes">;
    packageCount: number;
    includesCount: number;
}

function SearchResultsTabs(props: SearchResultsTabsProps) {
    const { t } = useI18n();
    return (
        <div class="tabs tabs-border my-6">
            <a
                class="tab"
                classList={{ "tab-active": props.activeTab() === "packages" }}
                onClick={() => props.setActiveTab("packages")}
            >
                {t("search.packagesTab", { count: props.packageCount })}
            </a>
            <a
                class="tab"
                classList={{ "tab-active": props.activeTab() === "includes" }}
                onClick={() => props.setActiveTab("includes")}
            >
                {t("search.includesTab", { count: props.includesCount })}
            </a>
        </div>
    );
}

export default SearchResultsTabs;
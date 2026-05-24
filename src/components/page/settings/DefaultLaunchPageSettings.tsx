import { For } from "solid-js";
import { Home, ChevronDown } from "lucide-solid";
import settingsStore from "../../../stores/settings";
import Card from "../../common/Card";
import { Dropdown, DropdownItem } from "../../common/Dropdown";
import { View } from "../../../types/scoop";
import { useI18n } from "../../../i18n";

function DefaultLaunchPageSettings() {
    const { t } = useI18n();
    const { settings, setDefaultLaunchPage } = settingsStore;

    const pages: { value: View; labelKey: string }[] = [
        { value: "search", labelKey: "header.search" },
        { value: "bucket", labelKey: "header.buckets" },
        { value: "installed", labelKey: "header.installed" },
        { value: "doctor", labelKey: "header.doctor" },
        { value: "settings", labelKey: "header.settings" },
    ];

    const currentPage = () => settings.defaultLaunchPage || "search";
    const currentLabel = () => {
        const match = pages.find(p => p.value === currentPage());
        return match ? t(match.labelKey) : currentPage();
    };

    return (
        <Card
            title={t("settings.defaultPage.title")}
            icon={Home}
            description={t("settings.defaultPage.description")}
            headerAction={
                <Dropdown
                    ariaLabel={t("settings.defaultPage.title")}
                    triggerClass="border border-base-content/20 min-w-[140px] justify-between"
                    trigger={<><span>{currentLabel()}</span><ChevronDown class="w-4 h-4 opacity-60" aria-hidden="true" /></>}
                >
                    <For each={pages}>
                        {(page) => (
                            <DropdownItem
                                active={currentPage() === page.value}
                                onClick={() => setDefaultLaunchPage(page.value)}
                            >
                                {t(page.labelKey)}
                            </DropdownItem>
                        )}
                    </For>
                </Dropdown>
            }
        />
    );
}

export default DefaultLaunchPageSettings;

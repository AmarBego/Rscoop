import { Home } from "lucide-solid";
import settingsStore from "../../../stores/settings";
import Card from "../../common/Card";
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

    const handlePageChange = (e: Event) => {
        const target = e.currentTarget as HTMLSelectElement;
        setDefaultLaunchPage(target.value as View);
    };

    return (
        <Card
            title={t("settings.defaultPage.title")}
            icon={Home}
            description={t("settings.defaultPage.description")}
            headerAction={
                <label class="label cursor-pointer gap-3">
                    <select
                        class="select select-bordered select-outline select-sm min-w-[140px]"
                        value={settings.defaultLaunchPage || "search"}
                        onChange={handlePageChange}
                    >
                        {pages.map((page) => (
                            <option value={page.value}>{t(page.labelKey)}</option>
                        ))}
                    </select>
                </label>
            }
        />
    );
}

export default DefaultLaunchPageSettings;

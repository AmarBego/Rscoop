import { Home } from "lucide-solid";
import settingsStore from "../../../stores/settings";
import Card from "../../common/Card";
import { View } from "../../../types/scoop";

function DefaultLaunchPageSettings() {
    const { settings, setDefaultLaunchPage } = settingsStore;

    const pages: { value: View; label: string }[] = [
        { value: "search", label: "Search" },
        { value: "bucket", label: "Buckets" },
        { value: "installed", label: "Installed" },
        { value: "doctor", label: "Doctor" },
        { value: "settings", label: "Settings" },
    ];

    const handlePageChange = (e: Event) => {
        const target = e.currentTarget as HTMLSelectElement;
        setDefaultLaunchPage(target.value as View);
    };

    return (
        <Card
            title="Default Launch Page"
            icon={Home}
            description="Choose which page to display when the application starts."
            headerAction={
                <label class="label cursor-pointer gap-3">
                    <select
                        class="select select-bordered select-outline select-sm min-w-[140px]"
                        value={settings.defaultLaunchPage || "search"}
                        onChange={handlePageChange}
                    >
                        {pages.map((page) => (
                            <option value={page.value}>{page.label}</option>
                        ))}
                    </select>
                </label>
            }
        />
    );
}

export default DefaultLaunchPageSettings;

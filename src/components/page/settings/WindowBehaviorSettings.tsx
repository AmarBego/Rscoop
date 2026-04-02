import { createSignal, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { Monitor } from "lucide-solid";
import settingsStore from "../../../stores/settings";
import SettingsToggle from "../../common/SettingsToggle";
import Card from "../../common/Card";
import { useI18n } from "../../../i18n";

function WindowBehaviorSettings() {
    const { t } = useI18n();
    const { settings, setWindowSettings } = settingsStore;
    const [isSaving, setIsSaving] = createSignal(false);

    // Load settings from the persistent store on mount
    onMount(async () => {
        try {
            const closeToTray = await invoke<boolean>("get_config_value", {
                key: "window.closeToTray"
            });
            const firstTrayNotificationShown = await invoke<boolean>("get_config_value", {
                key: "window.firstTrayNotificationShown"
            });

            if (closeToTray !== null || firstTrayNotificationShown !== null) {
                setWindowSettings({
                    closeToTray: closeToTray ?? true,
                    firstTrayNotificationShown: firstTrayNotificationShown ?? false,
                });
            }
        } catch (error) {
            console.error("Failed to load window settings:", error);
        }
    });

    const handleCloseToTrayChange = async (enabled: boolean) => {
        setIsSaving(true);
        try {
            await invoke("set_config_value", {
                key: "window.closeToTray",
                value: enabled
            });
            setWindowSettings({ closeToTray: enabled });
        } catch (error) {
            console.error("Failed to save close to tray setting:", error);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Card
            title={t("settings.window.title")}
            icon={Monitor}
            description={t("settings.window.description")}
            headerAction={
                <SettingsToggle
                    checked={settings.window.closeToTray}
                    onChange={(checked) => handleCloseToTrayChange(checked)}
                    disabled={isSaving()}
                    showStatusLabel={true}
                />
            }
        >
        </Card>
    );
}

export default WindowBehaviorSettings;
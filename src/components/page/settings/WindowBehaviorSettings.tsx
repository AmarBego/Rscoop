import { createSignal, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { Monitor } from "lucide-solid";
import settingsStore from "../../../stores/settings";
import SettingsToggle from "../../common/SettingsToggle";
import Card from "../../common/Card";

function WindowBehaviorSettings() {
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
            title="Window Behavior"
            icon={Monitor}
            description="Configure how the application window behaves when closing and minimize to system tray options."
            headerAction={
                <SettingsToggle
                    checked={settings.window.closeToTray}
                    onChange={(checked) => handleCloseToTrayChange(checked)}
                    disabled={isSaving()}
                    showStatusLabel={true}
                />
            }
        >
            <div class="space-y-4">
                {settings.window.closeToTray && (
                    <div class="form-control">
                        <p class="text-sm text-base-content/70 mb-2">
                            When enabled, closing the window will minimize Rscoop to the system tray instead of exiting the application
                        </p>
                    </div>
                )}
            </div>
        </Card>
    );
}

export default WindowBehaviorSettings;
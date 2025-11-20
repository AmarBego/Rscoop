import { createSignal, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { Monitor } from "lucide-solid";
import settingsStore from "../../../stores/settings";

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
        <div class="card bg-base-200 shadow-xl">
            <div class="card-body">
                <div class="flex items-center justify-between">
                    <h2 class="card-title text-xl">
                        <Monitor class="w-6 h-6 mr-2 text-primary" />
                        Window Behavior
                    </h2>
                    <div class="form-control">
                        <label class="label cursor-pointer">
                            <span class="label-text mr-4">Enable</span>
                            <input
                                type="checkbox"
                                class="toggle toggle-primary"
                                checked={settings.window.closeToTray}
                                disabled={isSaving()}
                                onChange={(e) => handleCloseToTrayChange(e.currentTarget.checked)}
                            />
                        </label>
                    </div>
                </div>
                <p class="text-base-content/80 mb-4">
                    Configure how the application window behaves when closing and minimize to system tray options.
                </p>

                <div class="space-y-4">
                    {settings.window.closeToTray && (
                        <div class="form-control">
                            <p class="text-sm text-base-content/70 mb-2">
                                When enabled, closing the window will minimize rScoop to the system tray instead of exiting the application
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default WindowBehaviorSettings;
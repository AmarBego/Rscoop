import { createSignal, onMount, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { Power } from "lucide-solid";
import SettingsToggle from "../../common/SettingsToggle";
import Card from "../../common/Card";
import { useI18n } from "../../../i18n";

export default function StartupSettings() {
    const { t } = useI18n();
    const [isAutoStartEnabled, setIsAutoStartEnabled] = createSignal(false);
    const [startMinimized, setStartMinimized] = createSignal(false);
    const [isLoading, setIsLoading] = createSignal(true);
    const [isSaving, setIsSaving] = createSignal(false);

    const fetchAutoStartStatus = async () => {
        setIsLoading(true);
        try {
            const status = await invoke<boolean>("is_auto_start_enabled");
            const minimized = await invoke<boolean | null>("get_config_value", {
                key: "startup.startMinimized",
            });
            setIsAutoStartEnabled(status);
            setStartMinimized(minimized ?? false);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("Failed to fetch auto-start status:", errorMsg);
        } finally {
            setIsLoading(false);
        }
    };

    const toggleAutoStart = async () => {
        setIsSaving(true);
        try {
            const newState = !isAutoStartEnabled();
            await invoke("set_auto_start_enabled_with_options", {
                enabled: newState,
                startMinimized: startMinimized(),
            });
            setIsAutoStartEnabled(newState);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("Failed to toggle auto-start:", errorMsg);
        } finally {
            setIsSaving(false);
        }
    };

    const toggleStartMinimized = async (enabled: boolean) => {
        setIsSaving(true);
        try {
            await invoke("set_config_value", {
                key: "startup.startMinimized",
                value: enabled,
            });
            await invoke("set_auto_start_enabled_with_options", {
                enabled: true,
                startMinimized: enabled,
            });
            setStartMinimized(enabled);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("Failed to toggle minimized startup:", errorMsg);
        } finally {
            setIsSaving(false);
        }
    };

    onMount(() => {
        fetchAutoStartStatus();
    });

    return (
        <Card
            title={t("settings.startup.title")}
            icon={Power}
            description={t("settings.startup.description")}
            headerAction={
                <SettingsToggle
                    checked={isAutoStartEnabled()}
                    onChange={toggleAutoStart}
                    disabled={isLoading() || isSaving()}
                    showStatusLabel={true}
                />
            }
        >
            <Show when={isAutoStartEnabled()}>
                <div class="mt-4 border-t border-base-content/10 pt-3">
                    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div class="min-w-0">
                            <div class="text-sm font-medium text-base-content">
                                {t("settings.startup.minimized")}
                            </div>
                            <p class="mt-1 text-xs text-base-content/50">
                                {t("settings.startup.minimizedDescription")}
                            </p>
                        </div>
                        <SettingsToggle
                            checked={startMinimized()}
                            onChange={toggleStartMinimized}
                            disabled={isLoading() || isSaving()}
                            ariaLabel={t("settings.startup.minimized")}
                            className="w-full justify-between sm:w-auto sm:justify-start"
                        />
                    </div>
                </div>
            </Show>
        </Card>
    );
}

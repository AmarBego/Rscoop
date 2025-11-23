import { createSignal, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { Power } from "lucide-solid";
import SettingsToggle from "../../common/SettingsToggle";
import Card from "../../common/Card";

export default function StartupSettings() {
    const [isAutoStartEnabled, setIsAutoStartEnabled] = createSignal(false);
    const [isLoading, setIsLoading] = createSignal(true);

    const fetchAutoStartStatus = async () => {
        setIsLoading(true);
        try {
            const status = await invoke<boolean>("is_auto_start_enabled");
            setIsAutoStartEnabled(status);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("Failed to fetch auto-start status:", errorMsg);
        } finally {
            setIsLoading(false);
        }
    };

    const toggleAutoStart = async () => {
        try {
            const newState = !isAutoStartEnabled();
            await invoke("set_auto_start_enabled", { enabled: newState });
            setIsAutoStartEnabled(newState);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("Failed to toggle auto-start:", errorMsg);
        }
    };

    onMount(() => {
        fetchAutoStartStatus();
    });

    return (
        <Card
            title="Startup Settings"
            icon={Power}
            description="Configure whether Rscoop should automatically start when Windows boots."
            headerAction={
                <SettingsToggle
                    checked={isAutoStartEnabled()}
                    onChange={toggleAutoStart}
                    disabled={isLoading()}
                    showStatusLabel={true}
                />
            }
        />
    );
}
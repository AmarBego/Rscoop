import { createSignal, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { Power } from "lucide-solid";

export default function StartupSettings() {
    const [isAutoStartEnabled, setIsAutoStartEnabled] = createSignal(false);
    const [isLoading, setIsLoading] = createSignal(true);
    const [error, setError] = createSignal<string | null>(null);
    const [successMessage, setSuccessMessage] = createSignal<string | null>(null);

    const fetchAutoStartStatus = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const status = await invoke<boolean>("is_auto_start_enabled");
            setIsAutoStartEnabled(status);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("Failed to fetch auto-start status:", errorMsg);
            setError("Could not load auto-start setting: " + errorMsg);
        } finally {
            setIsLoading(false);
        }
    };

    const toggleAutoStart = async () => {
        setError(null);
        setSuccessMessage(null);
        try {
            const newState = !isAutoStartEnabled();
            await invoke("set_auto_start_enabled", { enabled: newState });
            setIsAutoStartEnabled(newState);
            setSuccessMessage(
                newState
                    ? "Application will start automatically on boot."
                    : "Application will no longer start automatically on boot."
            );
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("Failed to toggle auto-start:", errorMsg);
            setError("Failed to update auto-start setting: " + errorMsg);
        }
    };

    onMount(() => {
        fetchAutoStartStatus();
    });

    return (
        <div class="card bg-base-200 shadow-xl">
            <div class="card-body">
                <div class="flex items-center justify-between">
                    <h2 class="card-title text-xl">
                        <Power class="w-6 h-6 mr-2 text-primary" />
                        Startup Settings
                    </h2>
                    <div class="form-control">
                        <label class="label cursor-pointer">
                            <span class="label-text mr-4">Enable</span>
                            <input
                                type="checkbox"
                                class="toggle toggle-primary"
                                checked={isAutoStartEnabled()}
                                onChange={toggleAutoStart}
                                disabled={isLoading()}
                            />
                        </label>
                    </div>
                </div>
                <p class="text-base-content/80 mb-4">
                    Configure whether the application should automatically start when Windows boots.
                </p>
                {isLoading() && (
                    <div class="text-sm text-base-content/70 mt-2">Loading...</div>
                )}
                {error() && <div class="alert alert-error mt-4 text-sm">{error()}</div>}
                {successMessage() && <div class="alert alert-success mt-4 text-sm">{successMessage()}</div>}
            </div>
        </div>
    );
}
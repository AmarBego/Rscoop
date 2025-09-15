import { createSignal, onMount, onCleanup } from "solid-js";
import { listen } from "@tauri-apps/api/event";
import { Show } from "solid-js";

function TrayNotificationToast() {
    const [showToast, setShowToast] = createSignal(false);

    onMount(async () => {
        const unlisten = await listen("show-tray-notification", () => {
            setShowToast(true);
            // Auto-hide after 5 seconds
            setTimeout(() => setShowToast(false), 5000);
        });

        onCleanup(() => {
            unlisten();
        });
    });

    return (
        <Show when={showToast()}>
            <div class="toast toast-top toast-end z-50">
                <div class="alert alert-info shadow-lg">
                    <div class="flex items-center">
                        <svg class="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div>
                            <h3 class="font-bold">Minimized to System Tray</h3>
                            <div class="text-xs">RSCoop is still running in the background. Click the tray icon to restore it.</div>
                        </div>
                    </div>
                    <div class="flex-none">
                        <button 
                            class="btn btn-sm btn-ghost"
                            onClick={() => setShowToast(false)}
                        >
                            ✕
                        </button>
                    </div>
                </div>
            </div>
        </Show>
    );
}

export default TrayNotificationToast;
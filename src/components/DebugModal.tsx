import { createSignal, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { info } from "@tauri-apps/plugin-log";
import settingsStore from "../stores/settings";
import Modal from "./common/Modal";

interface DebugInfo {
    timestamp: string;
    scoop_path: string;
    apps_dir_exists: boolean;
    app_count: number;
    cache_info: {
        cached_count: number;
        fingerprint: string | null;
    };
}

const DebugModal = () => {
    const [isOpen, setIsOpen] = createSignal(false);
    const [debugInfo, setDebugInfo] = createSignal<DebugInfo | null>(null);
    const [appLogs, setAppLogs] = createSignal<string>("");
    const [logFileContent, setLogFileContent] = createSignal<string>("");
    const [activeTab, setActiveTab] = createSignal<"info" | "logs">("info");
    const [isLoading, setIsLoading] = createSignal(false);

    const refreshDebugInfo = async () => {
        setIsLoading(true);
        try {
            const debugData = await invoke<DebugInfo>("get_debug_info");
            setDebugInfo(debugData);

            const logs = await invoke<string>("get_app_logs");
            setAppLogs(logs);

            const logFile = await invoke<string>("read_app_log_file");
            setLogFileContent(logFile);
        } catch (e) {
            info(`Failed to fetch debug info: ${e}`);
        } finally {
            setIsLoading(false);
        }
    };

    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            info("Debug information copied to clipboard");
        } catch (e) {
            info(`Failed to copy to clipboard: ${e}`);
        }
    };

    const exportDebugData = async () => {
        const data = {
            timestamp: new Date().toISOString(),
            debugInfo: debugInfo(),
            appLogs: appLogs(),
            logFileContent: logFileContent(),
        };

        await copyToClipboard(JSON.stringify(data, null, 2));
        info("Full debug data copied to clipboard");
    };

    return (
        <>
            {/* Debug button in header - positioned as a floating button */}
            <Show when={settingsStore.settings.debug.enabled}>
                <button
                    class="btn btn-sm btn-outline gap-2 fixed bottom-4 right-4 z-40"
                    onClick={() => {
                        setIsOpen(true);
                        refreshDebugInfo();
                    }}
                    title="Open Debug Information"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M13 10V3L4 14h7v7l9-11h-7z"
                        />
                    </svg>
                    Debug
                </button>
            </Show>

            {/* Debug Modal */}
            <Modal
                isOpen={isOpen()}
                onClose={() => setIsOpen(false)}
                title="Debug Information"
                size="full"
                footer={
                    <div class="flex gap-2 w-full justify-end">
                        <button
                            class="btn btn-sm"
                            onClick={refreshDebugInfo}
                            disabled={isLoading()}
                        >
                            {isLoading() ? "Loading..." : "Refresh"}
                        </button>
                        <button
                            class="btn btn-sm btn-primary"
                            onClick={exportDebugData}
                            disabled={isLoading() || !debugInfo()}
                        >
                            Copy All Data
                        </button>
                        <Show when={activeTab() === "logs" && logFileContent()}>
                            <button
                                class="btn btn-sm btn-info"
                                onClick={() => copyToClipboard(logFileContent())}
                            >
                                Copy Logs
                            </button>
                        </Show>
                        <button
                            class="btn btn-sm btn-outline"
                            onClick={() => setIsOpen(false)}
                        >
                            Close
                        </button>
                    </div>
                }
            >
                {/* Tabs */}
                <div class="tabs tabs-boxed mb-4">
                    <button
                        class="tab"
                        classList={{ "tab-active": activeTab() === "info" }}
                        onClick={() => setActiveTab("info")}
                    >
                        System Info
                    </button>
                    <button
                        class="tab"
                        classList={{ "tab-active": activeTab() === "logs" }}
                        onClick={() => setActiveTab("logs")}
                    >
                        Logs
                    </button>
                </div>

                {/* Tab Content */}
                <div class="flex-1 overflow-y-auto mb-4 bg-base-100 p-4 rounded border">
                    {/* Info Tab */}
                    <Show when={activeTab() === "info"}>
                        <Show when={debugInfo()}>
                            {(info) => (
                                <div class="space-y-3 font-mono text-sm">
                                    <div class="bg-base-200 p-2 rounded">
                                        <strong>Timestamp:</strong> {info().timestamp}
                                    </div>
                                    <div class="bg-base-200 p-2 rounded">
                                        <strong>Scoop Path:</strong> {info().scoop_path}
                                    </div>
                                    <div class="bg-base-200 p-2 rounded">
                                        <strong>Apps Directory Exists:</strong> {info().apps_dir_exists ? "✓ Yes" : "✗ No"}
                                    </div>
                                    <div class="bg-base-200 p-2 rounded">
                                        <strong>App Count in Directory:</strong> {info().app_count}
                                    </div>
                                    <div class="bg-base-200 p-2 rounded">
                                        <strong>Cache State:</strong>
                                        <div class="ml-4 mt-2">
                                            <div>Cached Apps: {info().cache_info.cached_count}</div>
                                            <div class="text-xs break-all">
                                                Fingerprint: {info().cache_info.fingerprint || "None"}
                                            </div>
                                        </div>
                                    </div>

                                    {info().app_count === 0 && info().apps_dir_exists && (
                                        <div class="bg-warning p-3 rounded text-warning-content">
                                            ⚠️ <strong>Alert:</strong> Apps directory exists but is empty. This could indicate:
                                            <ul class="ml-4 mt-2 list-disc">
                                                <li>Scoop installation issue</li>
                                                <li>Path resolution problem on MSI first-run</li>
                                                <li>Permission issue accessing apps</li>
                                            </ul>
                                        </div>
                                    )}

                                    {!info().apps_dir_exists && (
                                        <div class="bg-error p-3 rounded text-error-content">
                                            ✗ <strong>Error:</strong> Apps directory not found at {info().scoop_path}. Scoop may not be properly installed.
                                        </div>
                                    )}
                                </div>
                            )}
                        </Show>
                        <Show when={!debugInfo() && !isLoading()}>
                            <p class="text-center text-base-content/50">Click "Refresh" to load debug info</p>
                        </Show>
                    </Show>

                    {/* Logs Tab */}
                    <Show when={activeTab() === "logs"}>
                        <pre class="text-xs overflow-auto max-h-full whitespace-pre-wrap break-words">
                            {logFileContent() || (appLogs() ? "Loading log file..." : "No logs available")}
                        </pre>
                    </Show>
                </div>
            </Modal>
        </>
    );
};

export default DebugModal;

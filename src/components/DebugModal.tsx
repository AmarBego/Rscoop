import { createSignal, Show, createEffect } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { info } from "@tauri-apps/plugin-log";
import settingsStore from "../stores/settings";
import Modal from "./common/Modal";
import { useI18n } from "../i18n";

function FingerprintDisplay(props: { fingerprint: string | null }) {
    const { t } = useI18n();
    return (
        <Show when={props.fingerprint} fallback={<span class="opacity-50">{t("debug.fingerprintNone")}</span>}>
            {(fp: () => string) => {
                const raw = fp();
                const pipeIdx = raw.indexOf("|");
                const prefix = pipeIdx >= 0 ? raw.slice(0, pipeIdx) : null;
                const entries = (pipeIdx >= 0 ? raw.slice(pipeIdx + 1) : raw).split(";").filter(Boolean);
                return (
                    <div class="mt-1">
                        <Show when={prefix}>
                            <span class="text-info font-semibold mr-1">{t("debug.fingerprintApps", { count: prefix! })}</span>
                        </Show>
                        <div class="flex flex-wrap gap-1 mt-1">
                            {entries.map((entry) => {
                                const colonIdx = entry.indexOf(":");
                                const name = colonIdx >= 0 ? entry.slice(0, colonIdx) : entry;
                                const ts = colonIdx >= 0 ? entry.slice(colonIdx + 1) : "";
                                return (
                                    <span class="inline-flex items-baseline gap-0.5 bg-base-300 rounded px-1.5 py-0.5">
                                        <span class="text-accent font-medium">{name}</span>
                                        <span class="opacity-40">:</span>
                                        <span class="opacity-50">{ts}</span>
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                );
            }}
        </Show>
    );
}

function colorizeLogLines(raw: string): HTMLElement[] {
    return raw.split("\n").map((line) => {
        const span = document.createElement("span");
        span.textContent = line + "\n";

        if (/\bERROR\b/.test(line)) {
            span.className = "log-error";
        } else if (/\bWARN\b/.test(line)) {
            span.className = "log-warn";
        } else if (/\bINFO\b/.test(line)) {
            span.className = "log-info";
        } else if (/\bTRACE\b/.test(line)) {
            span.className = "log-trace";
        } else if (/\bDEBUG\b/.test(line)) {
            span.className = "log-debug";
        } else if (/^===/.test(line.trim())) {
            span.className = "log-marker";
        }

        return span;
    });
}

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
    const { t } = useI18n();
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
                title={t("debug.title")}
                size="full"
                footer={
                    <div class="flex gap-2 w-full justify-end">
                        <button
                            class="btn btn-sm"
                            onClick={refreshDebugInfo}
                            disabled={isLoading()}
                        >
                            {isLoading() ? t("common.loading") : t("common.refresh")}
                        </button>
                        <button
                            class="btn btn-sm btn-primary"
                            onClick={exportDebugData}
                            disabled={isLoading() || !debugInfo()}
                        >
                            {t("debug.copyAllData")}
                        </button>
                        <Show when={activeTab() === "logs" && logFileContent()}>
                            <button
                                class="btn btn-sm btn-info"
                                onClick={() => copyToClipboard(logFileContent())}
                            >
                                {t("debug.copyLogs")}
                            </button>
                        </Show>
                        <button
                            class="btn btn-sm btn-outline"
                            onClick={() => setIsOpen(false)}
                        >
                            {t("common.close")}
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
                        {t("debug.tabSystemInfo")}
                    </button>
                    <button
                        class="tab"
                        classList={{ "tab-active": activeTab() === "logs" }}
                        onClick={() => setActiveTab("logs")}
                    >
                        {t("debug.tabLogs")}
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
                                        <strong>{t("debug.timestamp")}</strong> {info().timestamp}
                                    </div>
                                    <div class="bg-base-200 p-2 rounded">
                                        <strong>{t("debug.scoopPath")}</strong> {info().scoop_path}
                                    </div>
                                    <div class="bg-base-200 p-2 rounded">
                                        <strong>{t("debug.appsDirExists")}</strong> {info().apps_dir_exists ? t("debug.yes") : t("debug.no")}
                                    </div>
                                    <div class="bg-base-200 p-2 rounded">
                                        <strong>{t("debug.appCount")}</strong> {info().app_count}
                                    </div>
                                    <div class="bg-base-200 p-2 rounded">
                                        <strong>{t("debug.cacheState")}</strong>
                                        <div class="ml-4 mt-2">
                                            <div>{t("debug.cachedApps")} {info().cache_info.cached_count}</div>
                                            <div class="text-xs break-all">
                                                <span class="opacity-70">{t("debug.fingerprint")}</span>
                                                <FingerprintDisplay fingerprint={info().cache_info.fingerprint} />
                                            </div>
                                        </div>
                                    </div>

                                    {info().app_count === 0 && info().apps_dir_exists && (
                                        <div class="bg-warning p-3 rounded text-warning-content">
                                            <strong>{t("debug.alertTitle")}</strong> {t("debug.alertMessage")}
                                            <ul class="ml-4 mt-2 list-disc">
                                                <li>{t("debug.alertReason1")}</li>
                                                <li>{t("debug.alertReason2")}</li>
                                                <li>{t("debug.alertReason3")}</li>
                                            </ul>
                                        </div>
                                    )}

                                    {!info().apps_dir_exists && (
                                        <div class="bg-error p-3 rounded text-error-content">
                                            <strong>{t("debug.errorTitle")}</strong> {t("debug.errorMessage", { path: info().scoop_path })}
                                        </div>
                                    )}
                                </div>
                            )}
                        </Show>
                        <Show when={!debugInfo() && !isLoading()}>
                            <p class="text-center text-base-content/50">{t("debug.clickRefresh")}</p>
                        </Show>
                    </Show>

                    {/* Logs Tab */}
                    <Show when={activeTab() === "logs"}>
                        <Show when={logFileContent()} fallback={
                            <pre class="text-xs overflow-auto max-h-full whitespace-pre-wrap break-words">
                                {appLogs() ? t("debug.logsLoading") : t("debug.logsNone")}
                            </pre>
                        }>
                            <pre
                                class="log-viewer text-xs overflow-auto max-h-full whitespace-pre-wrap break-words"
                                ref={(el) => {
                                    createEffect(() => {
                                        const content = logFileContent();
                                        if (content && el) {
                                            el.textContent = "";
                                            const nodes = colorizeLogLines(content);
                                            for (const node of nodes) {
                                                el.appendChild(node);
                                            }
                                            el.scrollTop = el.scrollHeight;
                                        }
                                    });
                                }}
                            />
                        </Show>
                    </Show>
                </div>
            </Modal>
        </>
    );
};

export default DebugModal;

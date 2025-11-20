import { createSignal, Show, onMount, createMemo, createEffect } from "solid-js";
import "./App.css";
import Header from "./components/Header.tsx";
import SearchPage from "./pages/SearchPage.tsx";
import InstalledPage from "./pages/InstalledPage.tsx";
import BucketPage from "./pages/BucketPage.tsx";
import { View } from "./types/scoop.ts";
import SettingsPage from "./pages/SettingsPage.tsx";
import DoctorPage from "./pages/DoctorPage.tsx";
import DebugModal from "./components/DebugModal.tsx";
import OperationModal from "./components/OperationModal.tsx";
import { listen } from "@tauri-apps/api/event";
import { info, error as logError } from "@tauri-apps/plugin-log";
import { createStoredSignal } from "./hooks/createStoredSignal";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { invoke } from "@tauri-apps/api/core";
import installedPackagesStore from "./stores/installedPackagesStore";
import { checkCwdMismatch } from "./utils/installCheck";


function App() {
    // Persist selected view across sessions.
    const [view, setView] = createStoredSignal<View>(
        "rscoop-view",
        "search"
    );

    // Always start with false on app launch to ensure loading screen shows
    const [readyFlag, setReadyFlag] = createSignal<"true" | "false">("false");

    // Track if the app is installed via Scoop
    const [isScoopInstalled, setIsScoopInstalled] = createSignal<boolean>(false);

    const isReady = createMemo(() => readyFlag() === "true");

    const [error, setError] = createSignal<string | null>(null);
    const [update, setUpdate] = createSignal<Update | null>(null);
    const [isInstalling, setIsInstalling] = createSignal(false);

    // Track if there's a CWD mismatch (MSI installation issue)
    const [hasCwdMismatch, setHasCwdMismatch] = createSignal(false);

    // Dev mode: allow bypassing the MSI modal for this session
    const [bypassCwdMismatch, setBypassCwdMismatch] = createSignal(false);

    // Auto-update modal state
    const [autoUpdateTitle, setAutoUpdateTitle] = createSignal<string | null>(null);

    // Debug: track state changes
    createEffect(() => {
        console.log("MSI State - hasCwdMismatch:", hasCwdMismatch(), "bypassCwdMismatch:", bypassCwdMismatch());
    });

    const handleInstallUpdate = async () => {
        if (!update()) return;
        setIsInstalling(true);
        try {
            await update()!.downloadAndInstall();
            await relaunch();
        } catch (e) {
            console.error("Failed to install update", e);
            setError("Failed to install the update. Please try restarting the application.");
            setIsInstalling(false);
        }
    };

    const handleCloseApp = async () => {
        try {
            await invoke("close_app");
        } catch (e) {
            console.error("Failed to close app:", e);
        }
    };

    const handleCloseAutoUpdateModal = (wasSuccess: boolean) => {
        setAutoUpdateTitle(null);
        if (wasSuccess) {
            // Refresh installed packages after auto-update
            installedPackagesStore.refetch();
        }
    };

    onMount(async () => {
        // Check if auto-start registry entry is enabled to decide mismatch suppression
        let autoStartEnabled = false;
        try { autoStartEnabled = await invoke<boolean>("is_auto_start_enabled"); } catch (e) { console.warn("Failed to query auto-start status", e); }
        // Detect if this is a new version launch (writes version file if changed)
        let isNewVersion = false;
        try { isNewVersion = await invoke<boolean>("check_and_update_version"); } catch (e) { console.warn("Failed to check/update version file", e); }

        try {
            // Check for CWD mismatch (MSI installation issue)
            const cwdMismatch = await checkCwdMismatch();
            // Show mismatch if it's a new version (force user relaunch) even on auto-start.
            // Otherwise suppress only when auto-start.
            if (cwdMismatch) {
                if (autoStartEnabled && !isNewVersion) {
                    info("CWD mismatch suppressed (auto-start, not new version)");
                    setHasCwdMismatch(false);
                } else {
                    setHasCwdMismatch(true);
                }
            } else {
                setHasCwdMismatch(false);
            }

            // Check if app is installed via Scoop
            const scoopInstalled = await invoke<boolean>("is_scoop_installation");
            setIsScoopInstalled(scoopInstalled);

            // Only check for updates if not installed via Scoop
            if (!scoopInstalled) {
                info("Checking for application updates...");
                const updateResult = await check();
                if (updateResult) {
                    info(`Update ${updateResult.version} is available.`);
                    setUpdate(updateResult);
                } else {
                    info("Application is up to date.");
                }
            } else {
                info("App is installed via Scoop. Auto-update disabled.");
            }
        } catch (e) {
            console.error("Failed to check for updates", e);
        }

        // Setup event listeners for both global and window-specific events
        const setupColdStartListeners = async () => {
            const webview = getCurrentWebviewWindow();
            const unlistenFunctions: (() => void)[] = [];

            // Listen for auto-update start events
            try {
                const unlisten = await listen<string>("auto-operation-start", (event) => {
                    info(`Auto-operation started: ${event.payload}`);
                    setAutoUpdateTitle(event.payload);
                });
                unlistenFunctions.push(unlisten);
            } catch (e) {
                logError(`Failed to register auto-operation-start listener: ${e}`);
            }

            // Listen for window-specific cold-start-finished event
            try {
                const unlisten1 = await webview.listen<boolean>("cold-start-finished", (event) => {
                    info(`Received window-specific cold-start-finished event with payload: ${event.payload}`);
                    handleColdStartEvent(event.payload);
                });
                unlistenFunctions.push(unlisten1);
            } catch (e) {
                logError(`Failed to register window-specific cold-start-finished listener: ${e}`);
            }

            // Listen for global cold-start-finished event as fallback
            try {
                const unlisten2 = await listen<boolean>("cold-start-finished", (event) => {
                    info(`Received global cold-start-finished event with payload: ${event.payload}`);
                    handleColdStartEvent(event.payload);
                });
                unlistenFunctions.push(unlisten2);
            } catch (e) {
                logError(`Failed to register global cold-start-finished listener: ${e}`);
            }

            // Listen for window-specific scoop-ready event
            try {
                const unlisten3 = await webview.listen<boolean>("scoop-ready", (event) => {
                    info(`Received window-specific scoop-ready event with payload: ${event.payload}`);
                    handleColdStartEvent(event.payload);
                });
                unlistenFunctions.push(unlisten3);
            } catch (e) {
                logError(`Failed to register window-specific scoop-ready listener: ${e}`);
            }

            // Listen for global scoop-ready event as fallback
            try {
                const unlisten4 = await listen<boolean>("scoop-ready", (event) => {
                    info(`Received global scoop-ready event with payload: ${event.payload}`);
                    handleColdStartEvent(event.payload);
                });
                unlistenFunctions.push(unlisten4);
            } catch (e) {
                logError(`Failed to register global scoop-ready listener: ${e}`);
            }

            return () => {
                // Clean up all listeners when component unmounts
                unlistenFunctions.forEach(unlisten => {
                    try {
                        unlisten();
                    } catch (e) {
                        logError(`Failed to unlisten: ${e}`);
                    }
                });
            };
        };

        const cleanup = await setupColdStartListeners();

        // Handle cold start event payload
        const handleColdStartEvent = (payload: boolean) => {
            // Only update if not already ready
            if (!isReady() && !error()) {
                if (payload) {
                    info("Cold start ready event - triggering installed packages refetch");
                    setReadyFlag("true");

                    // Trigger refetch of installed packages to ensure we get the freshly prefetched data
                    // Use a small delay to ensure backend event is fully processed
                    setTimeout(() => {
                        info("Executing deferred refetch of installed packages");
                        installedPackagesStore.refetch()
                            .then(() => info("Refetch completed successfully"))
                            .catch(err => {
                                logError(`Failed to refetch installed packages on cold start: ${err}`);
                            });
                    }, 100);
                } else {
                    setError(
                        "Scoop initialization failed. Please make sure Scoop is installed correctly and restart."
                    );
                    setReadyFlag("false");
                }
            }
        };

        // Force ready state after a timeout as a fallback
        const timeoutId = setTimeout(() => {
            if (!isReady() && !error()) {
                info("Forcing ready state after timeout");
                setReadyFlag("true");
            }
        }, 10000); // 10 second timeout

        // Clean up on unmount
        return () => {
            clearTimeout(timeoutId);
            cleanup();
        };
    });

    return (
        <>
            <Show when={hasCwdMismatch() && !bypassCwdMismatch()}>
                <div class="flex flex-col items-center justify-center h-screen bg-base-100 p-8 text-white">
                    <div class="alert outline-warning text-white shadow-lg max-w-lg">
                        <div class="flex flex-col gap-4 w-full">
                            <div class="flex items-start gap-3">
                                <svg class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M12 9v2m0 4v2m0 4v2M9 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V7a2 2 0 00-2-2h-4m-6 0V3m0 0a2 2 0 012-2h0a2 2 0 012 2v0m0 0h4v4m0-4h0a2 2 0 00-2-2h0a2 2 0 00-2 2v4" />
                                </svg>
                                <div>
                                    <h3 class="font-bold text-lg">MSI Launch Notice</h3>
                                    <p class="text-sm opacity-90">
                                        Everything is okay — this isn’t an error. Windows launched the app in a limited mode right after installation.
                                    </p>
                                </div>
                            </div>

                            <div class="text-sm opacity-90">
                                <p><strong>To enable all features, please close and reopen the app</strong> from the Start Menu or Desktop shortcut.</p>
                            </div>

                            <div class="flex justify-end gap-2">
                                <button class="btn btn-sm btn-outline btn-neutral" onClick={() => {
                                    console.log("Proceed Anyway clicked");
                                    setBypassCwdMismatch(true);
                                }}>
                                    Proceed Anyway
                                </button>
                                <button class="btn btn-sm btn-outline btn-info" onClick={handleCloseApp}>
                                    Close App Now
                                </button>
                            </div>

                            <details class="mt-2 text-sm opacity-80">
                                <summary class="cursor-pointer hover:underline">
                                    More details (for advanced users)
                                </summary>
                                <p class="mt-2">When launched directly from an MSI installer, Windows runs the process in a restricted execution context. This causes:</p>
                                <ul class="list-disc list-inside mt-1">
                                    <li>Current working directory (CWD) mismatch</li>
                                    <li>Limited folder and ACL permissions</li>
                                    <li>Symlinks may resolve incorrectly</li>
                                    <li>Process inherits MSI security token limitations</li>
                                </ul>
                                <p class="mt-2">This prevents normal initialization. Relaunching outside MSI context fixes this.</p>
                                <p class="mt-3 opacity-70">
                                    Have a workaround? <a href="https://github.com/amarbego/rscoop" target="_blank" class="link underline">Open a PR</a>.
                                </p>
                            </details>
                        </div>
                    </div>
                </div>
            </Show>

            <Show when={update() && !error() && !isScoopInstalled() && (!hasCwdMismatch() || bypassCwdMismatch())}>
                <div class="bg-sky-600 text-white p-2 text-center text-sm flex justify-center items-center gap-4">
                    <span>An update to version {update()!.version} is available.</span>
                    <button
                        class="bg-sky-800 hover:bg-sky-900 text-white font-bold py-1 px-3 rounded text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={isInstalling()}
                        onClick={handleInstallUpdate}
                    >
                        {isInstalling() ? "Installing..." : "Install Now"}
                    </button>
                    <button
                        class="hover:bg-sky-700 text-white font-bold py-1 px-3 rounded text-xs disabled:opacity-50"
                        disabled={isInstalling()}
                        onClick={() => setUpdate(null)}
                    >
                        Later
                    </button>
                </div>
            </Show>

            <Show when={!isReady() && !error() && (!hasCwdMismatch() || bypassCwdMismatch())}>
                <div class="flex flex-col items-center justify-center h-screen bg-base-100">
                    <h1 class="text-2xl font-bold mb-4">Rscoop</h1>
                    <p>Getting things ready... (upon install/update please be patient)</p>
                    <span class="loading loading-spinner loading-lg mt-4"></span>
                </div>
            </Show>

            <Show when={error() && (!hasCwdMismatch() || bypassCwdMismatch())}>
                <div class="flex flex-col items-center justify-center h-screen bg-base-100">
                    <h1 class="text-2xl font-bold text-error mb-4">Error</h1>
                    <p>{error()}</p>
                </div>
            </Show>

            <Show when={isReady() && !error() && (!hasCwdMismatch() || bypassCwdMismatch())}>
                <div class="drawer">
                    <input id="my-drawer" type="checkbox" class="drawer-toggle" />
                    <div class="drawer-content flex flex-col h-screen">
                        <Header currentView={view()} onNavigate={setView} />
                        <main class="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto">
                            <Show when={view() === "search"}>
                                <SearchPage />
                            </Show>
                            <Show when={view() === "bucket"}>
                                <BucketPage />
                            </Show>
                            <Show when={view() === "installed"}>
                                <InstalledPage onNavigate={setView} />
                            </Show>
                            <Show when={view() === "settings"}>
                                <SettingsPage isScoopInstalled={isScoopInstalled()} />
                            </Show>
                            <Show when={view() === "doctor"}>
                                <DoctorPage />
                            </Show>
                        </main>
                    </div>
                    <div class="drawer-side">
                        <label
                            for="my-drawer"
                            aria-label="close sidebar"
                            class="drawer-overlay"
                        ></label>
                        <ul class="menu p-4 w-80 min-h-full bg-base-200 text-base-content">
                            <li>
                                <a>Sidebar Item 1</a>
                            </li>
                            <li>
                                <a>Sidebar Item 2</a>
                            </li>
                        </ul>
                    </div>
                </div>
                <DebugModal />
            </Show>
            <OperationModal
                title={autoUpdateTitle()}
                onClose={handleCloseAutoUpdateModal}
            />
        </>
    );
}

export default App;

import { createSignal, Show, onMount, createMemo } from "solid-js";
import "./App.css";
import Header from "./components/Header.tsx";
import SearchPage from "./pages/SearchPage.tsx";
import InstalledPage from "./pages/InstalledPage.tsx";
import BucketPage from "./pages/BucketPage.tsx";
import { View } from "./types/scoop.ts";
import SettingsPage from "./pages/SettingsPage.tsx";
import DoctorPage from "./pages/DoctorPage.tsx";
import { listen } from "@tauri-apps/api/event";
import { info, error as logError } from "@tauri-apps/plugin-log";
import { createStoredSignal } from "./hooks/createStoredSignal";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { invoke } from "@tauri-apps/api/core";

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

    onMount(async () => {
        try {
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
                    setReadyFlag("true");
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
            <Show when={update() && !error() && !isScoopInstalled()}>
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

            <Show when={!isReady() && !error()}>
                <div class="flex flex-col items-center justify-center h-screen bg-base-100">
                    <h1 class="text-2xl font-bold mb-4">Rscoop</h1>
                    <p>Getting things ready...</p>
                    <span class="loading loading-spinner loading-lg mt-4"></span>
                </div>
            </Show>

            <Show when={error()}>
                <div class="flex flex-col items-center justify-center h-screen bg-base-100">
                    <h1 class="text-2xl font-bold text-error mb-4">Error</h1>
                    <p>{error()}</p>
                </div>
            </Show>

            <Show when={isReady() && !error()}>
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
                                <InstalledPage />
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
            </Show>
        </>
    );
}

export default App;

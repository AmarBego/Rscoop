import { createSignal, onMount, Show, For } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { ShieldCheck, BellOff, KeyRound, Save, Unlock, FolderCog } from "lucide-solid";
import settingsStore from "../stores/settings";
import heldStore from "../stores/held";
import OperationModal from "../components/OperationModal";

function SettingsPage() {
    const { settings, setVirusTotalSettings } = settingsStore;
    const { store: heldPackagesStore, refetch: refetchHeldPackages } = heldStore;

    const [apiKey, setApiKey] = createSignal("");
    const [scoopPath, setScoopPath] = createSignal("");
    const [isLoading, setIsLoading] = createSignal(true);
    const [pathIsLoading, setPathIsLoading] = createSignal(true);
    const [error, setError] = createSignal<string | null>(null);
    const [pathError, setPathError] = createSignal<string | null>(null);
    const [successMessage, setSuccessMessage] = createSignal<string | null>(null);
    const [pathSuccessMessage, setPathSuccessMessage] = createSignal<string | null>(null);

    // For the operation modal
    const [operationTitle, setOperationTitle] = createSignal<string | null>(null);

    const fetchApiKey = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const key = await invoke<string>("get_config_value", { key: "virustotal_api_key" });
            setApiKey(key);
            if (key) {
                // If an API key is present, assume the user wants the feature enabled.
                if (!settings.virustotal.enabled) {
                    setVirusTotalSettings({ enabled: true });
                }
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("Failed to fetch API key:", errorMsg);
            setError("Could not load VirusTotal API key. Scoop may not be installed or configured correctly.");
        } finally {
            setIsLoading(false);
        }
    };
    
    const fetchScoopPath = async () => {
        setPathIsLoading(true);
        setPathError(null);
        try {
            const path = await invoke<string | null>("get_scoop_path", {});
            setScoopPath(path ?? "");
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("Failed to fetch scoop path:", errorMsg);
            setPathError("Could not load Scoop path setting.");
        } finally {
            setPathIsLoading(false);
        }
    }
    
    const validateApiKey = (key: string): boolean => {
        // An empty string is valid, it just means no key is set.
        if (key === "") return true; 
        // Must be exactly 64 lowercase hex characters.
        const isValid = /^[a-f0-9]{64}$/.test(key);
        return isValid;
    };

    const handleSave = async () => {
        setError(null);
        setSuccessMessage(null);

        if (!validateApiKey(apiKey())) {
            setError("Invalid API Key. Must be 64 lowercase hexadecimal characters.");
            return;
        }

        try {
            await invoke("set_config_value", { key: "virustotal_api_key", value: apiKey() });
            // Enable the feature if a valid API key is being saved.
            if (apiKey() && !settings.virustotal.enabled) {
                setVirusTotalSettings({ enabled: true });
            }
            setSuccessMessage("API Key saved successfully!");
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("Failed to save API key:", errorMsg);
            setError("Failed to save API Key. Please check the console for more details.");
        }
    };
    
    const handleSavePath = async () => {
        setPathError(null);
        setPathSuccessMessage(null);
        try {
            await invoke("set_scoop_path", { path: scoopPath() });
            setPathSuccessMessage("Scoop path saved! Restart the app for it to take effect everywhere.");
            setTimeout(() => setPathSuccessMessage(null), 5000);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("Failed to save scoop path:", errorMsg);
            setPathError("Failed to save Scoop path.");
        }
    };
    
    onMount(() => {
        fetchApiKey();
        fetchScoopPath();
    });
    
    const handleUnhold = (packageName: string) => {
        setOperationTitle(`Removing hold from ${packageName}...`);
        invoke("unhold_package", { packageName }).finally(() => {
            refetchHeldPackages();
        });
    };

    const handleCloseOperationModal = () => {
        setOperationTitle(null);
    };

    return (
        <>
            <div class="p-4 sm:p-6 md:p-8">
                <h1 class="text-3xl font-bold mb-6">Settings</h1>
                
                <div class="space-y-8">
                    {/* Scoop Configuration Section */}
                    <div class="card bg-base-200 shadow-xl">
                        <div class="card-body">
                            <h2 class="card-title text-xl">
                                <FolderCog class="w-6 h-6 mr-2 text-primary" />
                                Scoop Configuration
                            </h2>
                            <p class="text-base-content/80 mb-4">
                                Set the installation path for your Scoop directory. The application may need to be restarted for this to take full effect.
                            </p>
                            <div class="form-control w-full max-w-lg">
                                <label class="label">
                                    <span class="label-text font-semibold flex items-center">
                                        Scoop Installation Path
                                    </span>
                                </label>
                                <div class="join">
                                    <input 
                                        type="text"
                                        placeholder={pathIsLoading() ? "Loading..." : "Enter Scoop path (e.g. C:\\scoop)"}
                                        class="input input-bordered join-item w-full" 
                                        value={scoopPath()}
                                        onInput={(e) => setScoopPath(e.currentTarget.value)}
                                        disabled={pathIsLoading()}
                                    />
                                    <button class="btn btn-primary join-item" onClick={handleSavePath} disabled={pathIsLoading()}>
                                        <Save class="w-4 h-4 mr-1" />
                                        Save
                                    </button>
                                </div>
                            </div>
                             {pathError() && <div class="alert alert-error mt-4 text-sm">{pathError()}</div>}
                            {pathSuccessMessage() && <div class="alert alert-success mt-4 text-sm">{pathSuccessMessage()}</div>}
                        </div>
                    </div>

                    {/* VirusTotal Section */}
                    <div class="card bg-base-200 shadow-xl">
                        <div class="card-body">
                            <div class="flex items-center justify-between">
                                <h2 class="card-title text-xl">
                                    <ShieldCheck class="w-6 h-6 mr-2 text-primary" />
                                    VirusTotal Integration
                                </h2>
                                 <div class="form-control">
                                    <label class="label cursor-pointer">
                                        <span class="label-text mr-4">Enable</span> 
                                        <input 
                                            type="checkbox" 
                                            class="toggle toggle-primary" 
                                            checked={settings.virustotal.enabled} 
                                            onchange={(e) => setVirusTotalSettings({ enabled: e.currentTarget.checked })}
                                            disabled={!apiKey()}
                                        />
                                    </label>
                                </div>
                            </div>
                            <p class="text-base-content/80 mb-4">
                                Automatically check package downloads against VirusTotal to prevent installing malicious software. 
                                You can get a free API key from the <a href="https://www.virustotal.com/gui/my-apikey" target="_blank" class="link link-primary">VirusTotal website</a>.
                            </p>

                            <div class="form-control w-full max-w-lg">
                                <label class="label">
                                    <span class="label-text font-semibold flex items-center">
                                        <KeyRound class="w-4 h-4 mr-2" />
                                        VirusTotal API Key
                                    </span>
                                </label>
                                <div class="join">
                                    <input 
                                        type="password"
                                        placeholder={isLoading() ? "Loading..." : "Enter your API key"}
                                        class="input input-bordered join-item w-full" 
                                        value={apiKey()}
                                        onInput={(e) => setApiKey(e.currentTarget.value)}
                                        disabled={isLoading()}
                                    />
                                    <button class="btn btn-primary join-item" onClick={handleSave} disabled={isLoading()}>
                                        <Save class="w-4 h-4 mr-1" />
                                        Save
                                    </button>
                                </div>
                            </div>

                            <Show when={settings.virustotal.enabled}>
                                <div class="divider"></div>
                                 <div class="space-y-4">
                                    <div class="form-control">
                                        <label class="label cursor-pointer">
                                            <span class="label-text">Auto-scan packages on install</span> 
                                            <input 
                                                type="checkbox" 
                                                class="toggle toggle-primary" 
                                                checked={settings.virustotal.autoScanOnInstall}
                                                onchange={(e) => setVirusTotalSettings({ autoScanOnInstall: e.currentTarget.checked })}
                                            />
                                        </label>
                                    </div>
                                </div>
                            </Show>

                            {error() && <div class="alert alert-error mt-4 text-sm">{error()}</div>}
                            {successMessage() && <div class="alert alert-success mt-4 text-sm">{successMessage()}</div>}
                        </div>
                    </div>

                    {/* Held Packages Section */}
                    <div class="card bg-base-200 shadow-xl">
                        <div class="card-body">
                            <h2 class="card-title text-xl">
                                <BellOff class="w-6 h-6 mr-2 text-warning" />
                                Held Packages Management
                            </h2>
                            <p class="text-base-content/80 mb-4">
                                Packages on hold are prevented from being updated via <code>scoop update *</code>.
                            </p>

                            <Show 
                                when={!heldPackagesStore.isLoading}
                                fallback={<div class="flex justify-center p-4"><span class="loading loading-dots loading-md"></span></div>}
                            >
                                <Show 
                                    when={heldPackagesStore.packages.length > 0}
                                    fallback={<p class="text-base-content/60 p-4 text-center">No packages are currently on hold.</p>}
                                >
                                    <div class="max-h-60 overflow-y-auto pr-2">
                                        <ul class="space-y-2">
                                            <For each={heldPackagesStore.packages}>
                                                {(pkgName) => (
                                                    <li class="flex justify-between items-center bg-base-100 p-2 rounded-lg transition-colors hover:bg-base-300">
                                                        <span class="font-mono text-sm">{pkgName}</span>
                                                        <button
                                                            class="btn btn-xs btn-ghost text-info"
                                                            onClick={() => handleUnhold(pkgName)}
                                                            aria-label={`Remove hold from ${pkgName}`}
                                                            disabled={!!operationTitle()}
                                                        >
                                                            <Unlock class="w-4 h-4 mr-1" />
                                                            Unhold
                                                        </button>
                                                    </li>
                                                )}
                                            </For>
                                        </ul>
                                    </div>
                                </Show>
                            </Show>
                        </div>
                    </div>
                </div>
            </div>
            <OperationModal
                title={operationTitle()}
                onClose={handleCloseOperationModal}
            />
        </>
    );
}

export default SettingsPage; 
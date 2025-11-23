import { createSignal, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { FolderCog, Save } from "lucide-solid";

export default function ScoopConfiguration() {
    const [scoopPath, setScoopPath] = createSignal("");
    const [pathIsLoading, setPathIsLoading] = createSignal(true);
    const [pathError, setPathError] = createSignal<string | null>(null);
    const [pathSuccessMessage, setPathSuccessMessage] = createSignal<string | null>(null);

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
        fetchScoopPath();
    });

    return (
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
    );
} 
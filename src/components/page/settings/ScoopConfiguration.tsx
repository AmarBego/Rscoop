import { createSignal, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { FolderCog } from "lucide-solid";
import Card from "../../common/Card";

export default function ScoopConfiguration() {
    const [scoopPath, setScoopPath] = createSignal("");
    const [pathIsLoading, setPathIsLoading] = createSignal(true);
    const [error, setError] = createSignal<string | null>(null);
    const [saved, setSaved] = createSignal(false);

    const fetchScoopPath = async () => {
        setPathIsLoading(true);
        setError(null);
        try {
            const path = await invoke<string | null>("get_scoop_path", {});
            setScoopPath(path ?? "");
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("Failed to fetch scoop path:", errorMsg);
            setError("Could not load Scoop path.");
        } finally {
            setPathIsLoading(false);
        }
    };

    const handleSave = async () => {
        setError(null);
        setSaved(false);
        try {
            await invoke("set_scoop_path", { path: scoopPath() });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("Failed to save scoop path:", errorMsg);
            setError("Failed to save path.");
        }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Enter") handleSave();
    };

    onMount(() => {
        fetchScoopPath();
    });

    return (
        <Card
            title="Scoop Configuration"
            icon={FolderCog}
            description="Set the path to your Scoop directory. Restart the app after changing this."
        >
            <div class="flex items-center gap-2 max-w-lg">
                <input
                    type="text"
                    placeholder={pathIsLoading() ? "Loading..." : "C:\\Users\\you\\scoop"}
                    class="input input-bordered input-sm flex-1 bg-base-100 font-mono text-xs"
                    value={scoopPath()}
                    onInput={(e) => setScoopPath(e.currentTarget.value)}
                    onKeyDown={handleKeyDown}
                    disabled={pathIsLoading()}
                />
                <button
                    class="btn btn-primary btn-sm"
                    onClick={handleSave}
                    disabled={pathIsLoading()}
                >
                    {saved() ? "Saved" : "Save"}
                </button>
            </div>
            {error() && <p class="text-error text-xs mt-1">{error()}</p>}
        </Card>
    );
}

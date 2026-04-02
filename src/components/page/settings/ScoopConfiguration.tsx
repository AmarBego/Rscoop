import { createSignal, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { FolderCog } from "lucide-solid";
import Card from "../../common/Card";
import { useI18n } from "../../../i18n";

export default function ScoopConfiguration() {
    const { t } = useI18n();
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
            setError(t("settings.scoop.errorLoad"));
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
            setError(t("settings.scoop.errorSave"));
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
            title={t("settings.scoop.title")}
            icon={FolderCog}
            description={t("settings.scoop.description")}
        >
            <div class="flex items-center gap-2 max-w-lg">
                <input
                    type="text"
                    placeholder={pathIsLoading() ? t("common.loading") : t("settings.scoop.placeholder")}
                    class="input input-bordered input-sm flex-1 bg-base-100 font-mono text-sm"
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
                    {saved() ? t("common.saved") : t("common.save")}
                </button>
            </div>
            {error() && <p class="text-error text-xs mt-1">{error()}</p>}
        </Card>
    );
}

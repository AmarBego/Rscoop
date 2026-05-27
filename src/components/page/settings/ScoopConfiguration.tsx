import { createSignal, onCleanup, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { FolderCog } from "lucide-solid";
import Card from "../../common/Card";
import { useI18n } from "../../../i18n";
import { getErrorMessage } from "../../../utils/errors";

export default function ScoopConfiguration() {
    const { t } = useI18n();
    const [scoopPath, setScoopPath] = createSignal("");
    const [pathIsLoading, setPathIsLoading] = createSignal(true);
    const [isSaving, setIsSaving] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);
    const [saved, setSaved] = createSignal(false);
    const inputId = "settings-scoop-path";
    const statusId = "settings-scoop-path-status";
    let savedTimeout: number | undefined;

    const fetchScoopPath = async () => {
        setPathIsLoading(true);
        setError(null);
        try {
            const path = await invoke<string | null>("get_scoop_path", {});
            setScoopPath(path ?? "");
        } catch (err) {
            const errorMsg = getErrorMessage(err);
            console.error("Failed to fetch scoop path:", errorMsg);
            setError(t("settings.scoop.errorLoad"));
        } finally {
            setPathIsLoading(false);
        }
    };

    const handleSave = async () => {
        if (pathIsLoading() || isSaving()) return;
        setError(null);
        setSaved(false);
        setIsSaving(true);
        try {
            await invoke("set_scoop_path", { path: scoopPath() });
            setSaved(true);
            window.clearTimeout(savedTimeout);
            savedTimeout = window.setTimeout(() => setSaved(false), 2000);
        } catch (err) {
            const errorMsg = getErrorMessage(err);
            console.error("Failed to save scoop path:", errorMsg);
            setError(t("settings.scoop.errorSave"));
        } finally {
            setIsSaving(false);
        }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleSave();
        }
    };

    onMount(() => {
        fetchScoopPath();
    });

    onCleanup(() => {
        window.clearTimeout(savedTimeout);
    });

    return (
        <Card
            title={t("settings.scoop.title")}
            icon={FolderCog}
            description={t("settings.scoop.description")}
        >
            <div class="flex flex-col gap-2 max-w-lg sm:flex-row sm:items-center">
                <label for={inputId} class="sr-only">{t("settings.scoop.title")}</label>
                <div class="min-w-0 flex-1">
                    <input
                        id={inputId}
                        type="text"
                        placeholder={pathIsLoading() ? t("common.loading") : t("settings.scoop.placeholder")}
                        class="input input-bordered input-sm w-full bg-base-100 font-mono text-sm focus:outline-none focus:border-base-content/20"
                        value={scoopPath()}
                        onInput={(e) => {
                            setScoopPath(e.currentTarget.value);
                            setError(null);
                        }}
                        onKeyDown={handleKeyDown}
                        disabled={pathIsLoading()}
                        aria-invalid={!!error()}
                        aria-describedby={statusId}
                    />
                </div>
                <button
                    type="button"
                    class="btn btn-primary btn-sm sm:self-auto"
                    onClick={handleSave}
                    disabled={pathIsLoading() || isSaving()}
                >
                    {isSaving() ? t("common.loading") : saved() ? t("common.saved") : t("common.save")}
                </button>
            </div>
            <p id={statusId} class="text-xs mt-1 min-h-4" aria-live="polite">
                {error() ? <span class="text-error">{error()}</span> : saved() ? <span class="text-success">{t("common.saved")}</span> : null}
            </p>
        </Card>
    );
}

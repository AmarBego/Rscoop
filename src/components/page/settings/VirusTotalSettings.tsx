import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { ShieldCheck } from "lucide-solid";
import settingsStore from "../../../stores/settings";
import SettingsToggle from "../../common/SettingsToggle";
import Card from "../../common/Card";
import { useI18n } from "../../../i18n";

export default function VirusTotalSettings() {
    const { t } = useI18n();
    const { settings, setVirusTotalSettings } = settingsStore;
    const [apiKey, setApiKey] = createSignal("");
    const [isLoading, setIsLoading] = createSignal(true);
    const [isSaving, setIsSaving] = createSignal(false);
    const [isClearing, setIsClearing] = createSignal(false);
    const [showKey, setShowKey] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);
    const [saved, setSaved] = createSignal(false);
    const [hasKey, setHasKey] = createSignal(false);
    const inputId = "settings-virustotal-api-key";
    const statusId = "settings-virustotal-api-key-status";
    let savedTimeout: number | undefined;

    const fetchApiKey = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const configured = await invoke<boolean>("has_virustotal_api_key");
            setHasKey(configured);
            setApiKey("");
            if (configured && !settings.virustotal.enabled) {
                setVirusTotalSettings({ enabled: true });
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("Failed to fetch API key:", errorMsg);
            setError(t("settings.virustotal.errorLoad"));
        } finally {
            setIsLoading(false);
        }
    };

    const validateApiKey = (key: string): boolean => {
        if (key === "") return true;
        return /^[a-f0-9]{64}$/.test(key);
    };

    const handleSave = async () => {
        if (isLoading() || isSaving()) return;
        setError(null);
        setSaved(false);

        const key = apiKey().trim();
        if (key === "") return;

        if (!validateApiKey(key)) {
            setError(t("settings.virustotal.errorInvalid"));
            return;
        }

        setIsSaving(true);
        try {
            await invoke("set_virustotal_api_key", { key });
            setApiKey("");
            setHasKey(true);
            setShowKey(false);
            if (!settings.virustotal.enabled) {
                setVirusTotalSettings({ enabled: true });
            }
            setSaved(true);
            window.clearTimeout(savedTimeout);
            savedTimeout = window.setTimeout(() => setSaved(false), 2000);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("Failed to save API key:", errorMsg);
            setError(t("settings.virustotal.errorSave"));
        } finally {
            setIsSaving(false);
        }
    };

    const handleClear = async () => {
        if (isLoading() || isClearing()) return;
        setError(null);
        setSaved(false);
        setIsClearing(true);
        try {
            await invoke("set_virustotal_api_key", { key: "" });
            setApiKey("");
            setHasKey(false);
            setShowKey(false);
            setVirusTotalSettings({ enabled: false });
            setSaved(true);
            window.clearTimeout(savedTimeout);
            savedTimeout = window.setTimeout(() => setSaved(false), 2000);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("Failed to clear API key:", errorMsg);
            setError(t("settings.virustotal.errorSave"));
        } finally {
            setIsClearing(false);
        }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleSave();
        }
    };

    onMount(() => {
        fetchApiKey();
    });

    onCleanup(() => {
        window.clearTimeout(savedTimeout);
    });

    return (
        <Card
            title={t("settings.virustotal.title")}
            icon={ShieldCheck}
            description={
                <span>
                    {t("settings.virustotal.description")}{" "}
                    {t("settings.virustotal.getApiKey")}{" "}
                    <a href="https://www.virustotal.com/gui/my-apikey" target="_blank" rel="noreferrer" class="link link-primary">
                        {t("settings.virustotal.websiteLink")}
                    </a>.
                </span>
            }
            headerAction={
                <SettingsToggle
                    checked={settings.virustotal.enabled}
                    onChange={(checked) => setVirusTotalSettings({ enabled: checked })}
                    disabled={!hasKey()}
                    showStatusLabel={true}
                    ariaLabel={t("settings.virustotal.title")}
                />
            }
        >
            {/* API key input */}
            <div class="flex flex-col gap-2 max-w-lg sm:flex-row sm:items-center">
                <label for={inputId} class="sr-only">{t("settings.virustotal.title")}</label>
                <div class="min-w-0 flex-1">
                    <input
                        id={inputId}
                        type={showKey() ? "text" : "password"}
                        placeholder={isLoading() ? t("common.loading") : hasKey() ? t("settings.virustotal.savedPlaceholder") : t("settings.virustotal.placeholder")}
                        class="input input-bordered input-sm w-full bg-base-100 font-mono text-sm focus:outline-none focus:border-base-content/20"
                        value={apiKey()}
                        onInput={(e) => {
                            setApiKey(e.currentTarget.value);
                            setError(null);
                        }}
                        onKeyDown={handleKeyDown}
                        disabled={isLoading()}
                        spellcheck={false}
                        autocomplete="new-password"
                        aria-invalid={!!error()}
                        aria-describedby={statusId}
                    />
                </div>
                <button
                    type="button"
                    class="btn btn-ghost btn-sm opacity-70 hover:opacity-100"
                    onClick={() => setShowKey(!showKey())}
                    disabled={isLoading() || !apiKey()}
                    aria-pressed={showKey()}
                >
                    {showKey() ? t("common.hide") : t("common.show")}
                </button>
                <button
                    type="button"
                    class="btn btn-primary btn-sm"
                    onClick={handleSave}
                    disabled={isLoading() || isSaving() || !apiKey()}
                >
                    {isSaving() ? t("common.loading") : saved() ? t("common.saved") : t("common.save")}
                </button>
                <Show when={hasKey()}>
                    <button
                        type="button"
                        class="btn btn-ghost btn-sm"
                        onClick={handleClear}
                        disabled={isLoading() || isClearing()}
                    >
                        {isClearing() ? t("common.loading") : t("common.remove")}
                    </button>
                </Show>
            </div>
            <p id={statusId} class="text-xs mt-1 min-h-4" aria-live="polite">
                {error() ? (
                    <span class="text-error">{error()}</span>
                ) : hasKey() ? (
                    <span class="text-success">{saved() ? t("common.saved") : t("settings.virustotal.configured")}</span>
                ) : saved() ? (
                    <span class="text-success">{t("common.saved")}</span>
                ) : null}
            </p>

            {/* Auto-scan toggle, always visible when enabled */}
            <Show when={settings.virustotal.enabled}>
                <div class="mt-4 pt-3 border-t border-base-content/10">
                    <SettingsToggle
                        checked={settings.virustotal.autoScanOnInstall}
                        onChange={(checked) => setVirusTotalSettings({ autoScanOnInstall: checked })}
                        label={t("settings.virustotal.autoScan")}
                        ariaLabel={t("settings.virustotal.autoScan")}
                    />
                </div>
            </Show>
        </Card>
    );
}

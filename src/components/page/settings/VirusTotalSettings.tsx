import { createSignal, onMount, Show } from "solid-js";
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
    const [showKey, setShowKey] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);
    const [saved, setSaved] = createSignal(false);
    const [hasKey, setHasKey] = createSignal(false);

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
        setError(null);
        setSaved(false);

        const key = apiKey().trim();
        if (key === "") return;

        if (!validateApiKey(key)) {
            setError(t("settings.virustotal.errorInvalid"));
            return;
        }

        try {
            await invoke("set_virustotal_api_key", { key });
            setApiKey("");
            setHasKey(true);
            setShowKey(false);
            if (!settings.virustotal.enabled) {
                setVirusTotalSettings({ enabled: true });
            }
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("Failed to save API key:", errorMsg);
            setError(t("settings.virustotal.errorSave"));
        }
    };

    const handleClear = async () => {
        setError(null);
        setSaved(false);
        try {
            await invoke("set_virustotal_api_key", { key: "" });
            setApiKey("");
            setHasKey(false);
            setShowKey(false);
            setVirusTotalSettings({ enabled: false });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("Failed to clear API key:", errorMsg);
            setError(t("settings.virustotal.errorSave"));
        }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Enter") handleSave();
    };

    onMount(() => {
        fetchApiKey();
    });

    return (
        <Card
            title={t("settings.virustotal.title")}
            icon={ShieldCheck}
            description={
                <span>
                    {t("settings.virustotal.description")}{" "}
                    {t("settings.virustotal.getApiKey")}{" "}
                    <a href="https://www.virustotal.com/gui/my-apikey" target="_blank" class="link link-primary">
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
                />
            }
        >
            {/* API key input */}
            <div class="flex items-center gap-2 max-w-lg">
                <input
                    type={showKey() ? "text" : "password"}
                    placeholder={isLoading() ? t("common.loading") : hasKey() ? t("settings.virustotal.savedPlaceholder") : t("settings.virustotal.placeholder")}
                    class="input input-bordered input-sm flex-1 bg-base-100 font-mono text-sm"
                    value={apiKey()}
                    onInput={(e) => setApiKey(e.currentTarget.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isLoading()}
                    spellcheck={false}
                    autocomplete="new-password"
                />
                <button
                    class="btn btn-ghost btn-xs opacity-50 hover:opacity-100"
                    onClick={() => setShowKey(!showKey())}
                    tabIndex={-1}
                    disabled={isLoading() || !apiKey()}
                >
                    {showKey() ? t("common.hide") : t("common.show")}
                </button>
                <button
                    class="btn btn-primary btn-sm"
                    onClick={handleSave}
                    disabled={isLoading() || !apiKey()}
                >
                    {saved() ? t("common.saved") : t("common.save")}
                </button>
                <Show when={hasKey()}>
                    <button
                        class="btn btn-ghost btn-sm"
                        onClick={handleClear}
                        disabled={isLoading()}
                    >
                        {t("common.remove")}
                    </button>
                </Show>
            </div>
            <Show when={hasKey()}>
                <p class="text-success text-xs mt-1">{t("settings.virustotal.configured")}</p>
            </Show>

            <Show when={error()}>
                <p class="text-error text-xs mt-1">{error()}</p>
            </Show>

            {/* Auto-scan toggle, always visible when enabled */}
            <Show when={settings.virustotal.enabled}>
                <div class="mt-4 pt-3 border-t border-base-content/10">
                    <SettingsToggle
                        checked={settings.virustotal.autoScanOnInstall}
                        onChange={(checked) => setVirusTotalSettings({ autoScanOnInstall: checked })}
                        label={t("settings.virustotal.autoScan")}
                    />
                </div>
            </Show>
        </Card>
    );
}

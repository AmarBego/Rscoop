import { createSignal, onMount, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCcw, ChevronDown } from "lucide-solid";
import settingsStore from "../../../stores/settings";
import { BucketAutoUpdateInterval } from "../../../stores/settings";
import Card from "../../common/Card";
import { Dropdown, DropdownItem } from "../../common/Dropdown";
import { useI18n } from "../../../i18n";

type IntervalUnit = "minutes" | "hours" | "days" | "weeks";

const PRESET_VALUES: { value: BucketAutoUpdateInterval }[] = [
    { value: "off" },
    { value: "24h" },
    { value: "7d" },
];

function isBucketAutoUpdateInterval(value: string): value is BucketAutoUpdateInterval {
    return (
        value === "off" ||
        value === "24h" ||
        value === "7d" ||
        value === "1d" ||
        value === "1w" ||
        value === "1h" ||
        value === "6h" ||
        /^\d+$/.test(value) ||
        /^custom:\d+$/.test(value)
    );
}

function hasStringValue(value: unknown): value is { value: string } {
    return typeof value === "object" && value !== null && "value" in value && typeof value.value === "string";
}

function customInterval(seconds: number): BucketAutoUpdateInterval {
    return `custom:${seconds}` as BucketAutoUpdateInterval;
}

export default function BucketAutoUpdateSettings() {
    const { t } = useI18n();
    const { settings, setBucketSettings } = settingsStore;
    const [loading, setLoading] = createSignal(false);
    const [saving, setSaving] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);
    const [showCustom, setShowCustom] = createSignal(false);

    const fetchInterval = async () => {
        setLoading(true);
        setError(null);
        try {
            const value = await invoke<unknown>("get_config_value", { key: "buckets.autoUpdateInterval" });
            if (typeof value === "string" && isBucketAutoUpdateInterval(value)) {
                setBucketSettings({ autoUpdateInterval: value });
            } else if (hasStringValue(value) && isBucketAutoUpdateInterval(value.value)) {
                setBucketSettings({ autoUpdateInterval: value.value });
            }
        } catch {
            setError(null);
        } finally {
            setLoading(false);
        }
    };

    const persistInterval = async (newValue: BucketAutoUpdateInterval) => {
        setSaving(true);
        setError(null);
        try {
            setBucketSettings({ autoUpdateInterval: newValue });
        } catch {
            setError(t("settings.bucketUpdate.errorSave"));
        } finally {
            setSaving(false);
        }
    };

    const isPreset = () => PRESET_VALUES.some(p => p.value === settings.buckets.autoUpdateInterval);
    const isCustom = () => !isPreset() && settings.buckets.autoUpdateInterval !== "off";
    const presetLabel = (value: BucketAutoUpdateInterval) => {
        if (value === "off") return t("settings.bucketUpdate.off");
        if (value === "24h") return t("settings.bucketUpdate.every24h");
        if (value === "7d") return t("settings.bucketUpdate.every7d");
        return value;
    };

    onMount(() => {
        fetchInterval();
    });

    // Show custom editor if current value is already custom
    onMount(() => {
        if (!isPreset()) setShowCustom(true);
    });

    return (
        <Card
            title={t("settings.bucketUpdate.title")}
            icon={RefreshCcw}
            description={t("settings.bucketUpdate.description")}
            headerAction={
                <div class="flex items-center gap-2" aria-live="polite">
                    <ActiveBadge value={settings.buckets.autoUpdateInterval} />
                    {saving() && <span class="loading loading-spinner loading-xs" />}
                </div>
            }
        >
            {/* Interval selector */}
            <div class="flex items-center gap-2">
                <div class="flex w-full flex-wrap bg-base-100 rounded-lg p-1 gap-1 sm:w-auto" role="group" aria-label={t("settings.bucketUpdate.title")}>
                    {PRESET_VALUES.map(opt => (
                        <button
                            type="button"
                            class="btn btn-sm rounded-md flex-1 sm:flex-none"
                            classList={{
                                "btn-primary": settings.buckets.autoUpdateInterval === opt.value,
                                "btn-ghost": settings.buckets.autoUpdateInterval !== opt.value,
                            }}
                            aria-pressed={settings.buckets.autoUpdateInterval === opt.value}
                            disabled={loading() || saving()}
                            onClick={() => {
                                persistInterval(opt.value);
                                setShowCustom(false);
                            }}
                        >
                            {presetLabel(opt.value)}
                        </button>
                    ))}
                    <button
                        type="button"
                        class="btn btn-sm rounded-md flex-1 sm:flex-none"
                        classList={{
                            "btn-primary": isCustom() || (showCustom() && !isCustom()),
                            "btn-ghost": !isCustom() && !showCustom(),
                        }}
                        aria-pressed={isCustom() || (showCustom() && !isCustom())}
                        disabled={loading() || saving()}
                        onClick={() => setShowCustom(true)}
                    >
                        {t("settings.bucketUpdate.custom")}
                    </button>
                </div>
            </div>

            {/* Custom interval editor */}
            <Show when={showCustom()}>
                <CustomIntervalEditor
                    currentValue={settings.buckets.autoUpdateInterval}
                    onPersist={persistInterval}
                    disabled={loading() || saving()}
                    debug={settings.debug.enabled}
                />
            </Show>

            {/* Auto update packages toggle */}
            <Show when={settings.buckets.autoUpdateInterval !== "off"}>
                <div class="border-t border-base-content/10 mt-4 pt-3">
                    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div class="min-w-0 pe-4">
                            <label for="settings-bucket-auto-update-packages" class="text-sm font-medium">{t("settings.bucketUpdate.autoUpdatePackages")}</label>
                            <p class="text-xs text-base-content/50">{t("settings.bucketUpdate.autoUpdatePackagesDescription")}</p>
                        </div>
                        <input
                            id="settings-bucket-auto-update-packages"
                            type="checkbox"
                            class="toggle toggle-primary"
                            checked={settings.buckets.autoUpdatePackagesEnabled}
                            onChange={(e) => {
                                setBucketSettings({ autoUpdatePackagesEnabled: e.currentTarget.checked });
                            }}
                        />
                    </div>
                </div>
            </Show>

            <Show when={settings.debug.enabled && settings.buckets.autoUpdateInterval !== "off"}>
                <div class="mt-3">
                    <button
                        type="button"
                        class="btn btn-sm btn-warning"
                        disabled={saving() || loading()}
                        onClick={() => persistInterval("custom:10")}
                    >
                        {t("settings.bucketUpdate.debug10s")}
                    </button>
                </div>
            </Show>

            {error() && <p class="text-error text-xs mt-2" role="status" aria-live="polite">{error()}</p>}
        </Card>
    );
}

// --- Custom interval editor ---

interface CustomIntervalEditorProps {
    currentValue: BucketAutoUpdateInterval;
    onPersist: (newValue: BucketAutoUpdateInterval) => Promise<void> | void;
    disabled?: boolean;
    debug?: boolean;
}

function parseSeconds(value: string): number | null {
    if (value.startsWith("custom:")) {
        const n = parseInt(value.substring(7), 10);
        return Number.isFinite(n) ? n : null;
    }
    const map: Record<string, number> = { "24h": 86400, "1d": 86400, "7d": 604800, "1w": 604800, "1h": 3600, "6h": 21600 };
    return map[value] ?? (/^\d+$/.test(value) ? parseInt(value, 10) : null);
}

function CustomIntervalEditor(props: CustomIntervalEditorProps) {
    const { t } = useI18n();
    const [quantity, setQuantity] = createSignal(1);
    const [unit, setUnit] = createSignal<IntervalUnit>("days");
    const [error, setError] = createSignal<string | null>(null);
    const [saved, setSaved] = createSignal(false);
    const inputId = "settings-bucket-custom-interval-quantity";
    const statusId = "settings-bucket-custom-interval-status";

    const unitSeconds = (u: IntervalUnit) => ({ minutes: 60, hours: 3600, days: 86400, weeks: 604800 }[u]);

    onMount(() => {
        const secs = parseSeconds(props.currentValue);
        if (secs) {
            if (secs % 604800 === 0) { setQuantity(secs / 604800); setUnit("weeks"); }
            else if (secs % 86400 === 0) { setQuantity(secs / 86400); setUnit("days"); }
            else if (secs % 3600 === 0) { setQuantity(secs / 3600); setUnit("hours"); }
            else if (secs % 60 === 0) { setQuantity(secs / 60); setUnit("minutes"); }
        }
    });

    const totalSeconds = () => quantity() * unitSeconds(unit());

    const handleSave = async () => {
        const secs = totalSeconds();
        const minSecs = props.debug ? 10 : 300;
        if (secs < minSecs) {
            setError(t("settings.bucketUpdate.errorMinimum", { minSecs: minSecs.toString() }));
            return;
        }
        setError(null);
        await props.onPersist(customInterval(secs));
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    return (
        <div class="flex flex-col gap-2 mt-3 sm:flex-row sm:items-center">
            <label for={inputId} class="sr-only">{t("settings.bucketUpdate.custom")}</label>
            <input
                id={inputId}
                type="number"
                min={1}
                class="input input-sm input-bordered w-full bg-base-100 font-mono text-sm focus:outline-none focus:border-base-content/20 sm:w-20"
                value={quantity()}
                disabled={props.disabled}
                aria-invalid={!!error()}
                aria-describedby={statusId}
                onInput={(e) => {
                    const next = parseInt(e.currentTarget.value || "1", 10);
                    setQuantity(Number.isFinite(next) ? next : 1);
                    setError(null);
                }}
            />
            <Dropdown
                ariaLabel={t("settings.bucketUpdate.custom")}
                disabled={props.disabled}
                triggerClass="border border-base-content/20 w-full justify-between sm:w-auto"
                menuWidth="w-32"
                trigger={
                    <>
                        <span>{t(`settings.bucketUpdate.unit${unit() === "minutes" ? "Min" : unit() === "hours" ? "Hr" : unit() === "days" ? "Days" : "Wk"}`)}</span>
                        <ChevronDown class="w-4 h-4 opacity-60" aria-hidden="true" />
                    </>
                }
            >
                <DropdownItem active={unit() === "minutes"} onClick={() => { setUnit("minutes"); setError(null); }}>{t("settings.bucketUpdate.unitMin")}</DropdownItem>
                <DropdownItem active={unit() === "hours"} onClick={() => { setUnit("hours"); setError(null); }}>{t("settings.bucketUpdate.unitHr")}</DropdownItem>
                <DropdownItem active={unit() === "days"} onClick={() => { setUnit("days"); setError(null); }}>{t("settings.bucketUpdate.unitDays")}</DropdownItem>
                <DropdownItem active={unit() === "weeks"} onClick={() => { setUnit("weeks"); setError(null); }}>{t("settings.bucketUpdate.unitWk")}</DropdownItem>
            </Dropdown>
            <button
                type="button"
                class="btn btn-sm btn-primary"
                disabled={props.disabled || !!error()}
                onClick={handleSave}
            >
                {saved() ? t("common.saved") : t("settings.bucketUpdate.set")}
            </button>
            <span id={statusId} class="text-xs min-h-4" aria-live="polite">
                {error() ? <span class="text-error">{error()}</span> : saved() ? <span class="text-success">{t("common.saved")}</span> : null}
            </span>
        </div>
    );
}

// --- Active badge ---

function ActiveBadge(props: { value: BucketAutoUpdateInterval }) {
    const { t } = useI18n();
    const label = () => formatInterval(props.value, t);
    return (
        <span class="text-xs font-medium px-2 py-1 rounded bg-base-100 text-base-content/70">
            {label()}
        </span>
    );
}

function formatInterval(raw: BucketAutoUpdateInterval, t: (key: string) => string): string {
    if (!raw || raw === "off") return t("settings.bucketUpdate.off");
    if (raw === "24h" || raw === "1d") return "24h";
    if (raw === "7d" || raw === "1w") return "7d";
    if (raw === "1h") return "1h";
    if (raw === "6h") return "6h";
    if (raw.startsWith("custom:")) {
        const secs = parseInt(raw.substring(7), 10);
        if (!Number.isFinite(secs) || secs <= 0) return t("settings.bucketUpdate.custom");
        if (secs % 604800 === 0) return `${secs / 604800}w`;
        if (secs % 86400 === 0) return `${secs / 86400}d`;
        if (secs % 3600 === 0) return `${secs / 3600}h`;
        if (secs % 60 === 0) return `${secs / 60}m`;
        return `${secs}s`;
    }
    if (/^\d+$/.test(raw)) return `${raw}s`;
    return raw;
}

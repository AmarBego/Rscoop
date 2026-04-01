import { createSignal, onMount, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCcw } from "lucide-solid";
import settingsStore from "../../../stores/settings";
import Card from "../../common/Card";

const PRESETS = [
    { label: "Off", value: "off" },
    { label: "24h", value: "24h" },
    { label: "7d", value: "7d" },
];

export default function BucketAutoUpdateSettings() {
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
            if (typeof value === "string") {
                setBucketSettings({ autoUpdateInterval: value });
            } else if (value && typeof value === "object" && (value as any).value) {
                const v = (value as any).value;
                if (typeof v === "string") setBucketSettings({ autoUpdateInterval: v });
            }
        } catch {
            setError(null);
        } finally {
            setLoading(false);
        }
    };

    const persistInterval = async (newValue: string) => {
        setSaving(true);
        setError(null);
        try {
            setBucketSettings({ autoUpdateInterval: newValue });
            await invoke("set_config_value", { key: "buckets.autoUpdateInterval", value: newValue });
        } catch {
            setError("Failed to save interval.");
        } finally {
            setSaving(false);
        }
    };

    const isPreset = () => PRESETS.some(p => p.value === settings.buckets.autoUpdateInterval);
    const isCustom = () => !isPreset() && settings.buckets.autoUpdateInterval !== "off";

    onMount(() => {
        fetchInterval();
    });

    // Show custom editor if current value is already custom
    onMount(() => {
        if (!isPreset()) setShowCustom(true);
    });

    return (
        <Card
            title="Bucket Auto Update"
            icon={RefreshCcw}
            description="Keep bucket manifests fresh by updating on a schedule."
            headerAction={
                <div class="flex items-center gap-2">
                    <ActiveBadge value={settings.buckets.autoUpdateInterval} />
                    {saving() && <span class="loading loading-spinner loading-xs" />}
                </div>
            }
        >
            {/* Interval selector */}
            <div class="flex items-center gap-2">
                <div class="flex bg-base-100 rounded-lg p-0.5 gap-0.5">
                    {PRESETS.map(opt => (
                        <button
                            class="btn btn-xs rounded-md"
                            classList={{
                                "btn-primary": settings.buckets.autoUpdateInterval === opt.value,
                                "btn-ghost": settings.buckets.autoUpdateInterval !== opt.value,
                            }}
                            disabled={loading() || saving()}
                            onClick={() => {
                                persistInterval(opt.value);
                                setShowCustom(false);
                            }}
                        >
                            {opt.label}
                        </button>
                    ))}
                    <button
                        class="btn btn-xs rounded-md"
                        classList={{
                            "btn-primary": isCustom() || (showCustom() && !isCustom()),
                            "btn-ghost": !isCustom() && !showCustom(),
                        }}
                        disabled={loading() || saving()}
                        onClick={() => setShowCustom(true)}
                    >
                        Custom
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
                    <div class="flex items-center justify-between">
                        <div>
                            <span class="text-sm font-medium">Auto-update packages</span>
                            <p class="text-xs text-base-content/50">Update all packages after each bucket refresh.</p>
                        </div>
                        <input
                            type="checkbox"
                            class="toggle toggle-primary"
                            checked={settings.buckets.autoUpdatePackagesEnabled}
                            onChange={async (e) => {
                                setBucketSettings({ autoUpdatePackagesEnabled: e.currentTarget.checked });
                                await invoke("set_config_value", { key: "buckets.autoUpdatePackagesEnabled", value: e.currentTarget.checked });
                            }}
                        />
                    </div>
                </div>
            </Show>

            <Show when={settings.debug.enabled && settings.buckets.autoUpdateInterval !== "off"}>
                <div class="mt-3">
                    <button
                        class="btn btn-xs btn-warning"
                        disabled={saving() || loading()}
                        onClick={() => persistInterval("custom:10")}
                    >
                        Debug: 10s interval
                    </button>
                </div>
            </Show>

            {error() && <p class="text-error text-xs mt-2">{error()}</p>}
        </Card>
    );
}

// --- Custom interval editor ---

interface CustomIntervalEditorProps {
    currentValue: string;
    onPersist: (newValue: string) => Promise<void> | void;
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
    const [quantity, setQuantity] = createSignal(1);
    const [unit, setUnit] = createSignal("days");
    const [error, setError] = createSignal<string | null>(null);
    const [saved, setSaved] = createSignal(false);

    const unitSeconds = (u: string) => ({ minutes: 60, hours: 3600, days: 86400, weeks: 604800 }[u] || 0);

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
            setError(`Minimum is ${minSecs} seconds.`);
            return;
        }
        setError(null);
        await props.onPersist(`custom:${secs}`);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    return (
        <div class="flex items-center gap-2 mt-3">
            <input
                type="number"
                min={1}
                class="input input-sm input-bordered w-20 bg-base-100 font-mono text-xs"
                value={quantity()}
                disabled={props.disabled}
                onInput={(e) => { setQuantity(parseInt(e.currentTarget.value || "1", 10)); setError(null); }}
            />
            <select
                class="select select-sm select-bordered bg-base-100 text-xs"
                value={unit()}
                disabled={props.disabled}
                onChange={(e) => { setUnit(e.currentTarget.value); setError(null); }}
            >
                <option value="minutes">min</option>
                <option value="hours">hr</option>
                <option value="days">days</option>
                <option value="weeks">wk</option>
            </select>
            <button
                class="btn btn-sm btn-primary"
                disabled={props.disabled || !!error()}
                onClick={handleSave}
            >
                {saved() ? "Saved" : "Set"}
            </button>
            {error() && <span class="text-error text-xs">{error()}</span>}
        </div>
    );
}

// --- Active badge ---

function ActiveBadge(props: { value: string }) {
    const label = () => formatInterval(props.value);
    return (
        <span class="text-xs font-medium px-2 py-1 rounded bg-base-100 text-base-content/70">
            {label()}
        </span>
    );
}

function formatInterval(raw: string): string {
    if (!raw || raw === "off") return "Off";
    if (raw === "24h" || raw === "1d") return "24h";
    if (raw === "7d" || raw === "1w") return "7d";
    if (raw === "1h") return "1h";
    if (raw === "6h") return "6h";
    if (raw.startsWith("custom:")) {
        const secs = parseInt(raw.substring(7), 10);
        if (!Number.isFinite(secs) || secs <= 0) return "Custom";
        if (secs % 604800 === 0) return `${secs / 604800}w`;
        if (secs % 86400 === 0) return `${secs / 86400}d`;
        if (secs % 3600 === 0) return `${secs / 3600}h`;
        if (secs % 60 === 0) return `${secs / 60}m`;
        return `${secs}s`;
    }
    if (/^\d+$/.test(raw)) return `${raw}s`;
    return raw;
}

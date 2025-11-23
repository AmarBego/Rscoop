import { createSignal, onMount, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCcw } from "lucide-solid";
import settingsStore from "../../../stores/settings";
import Card from "../../common/Card";

// Predefined new intervals per requirement plus backward compatibility display
const INTERVAL_OPTIONS: { label: string; value: string; description: string }[] = [
    { label: "Off", value: "off", description: "Disable scheduled bucket updates" },
    { label: "Every 24 Hours", value: "24h", description: "Run once per day" },
    { label: "Every Week", value: "7d", description: "Run once every 7 days" },
];

export default function BucketAutoUpdateSettings() {
    const { settings, setBucketSettings } = settingsStore;
    const [loading, setLoading] = createSignal(false);
    const [saving, setSaving] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);

    const fetchInterval = async () => {
        setLoading(true);
        setError(null);
        try {
            const value = await invoke<unknown>("get_config_value", { key: "buckets.autoUpdateInterval" });
            if (typeof value === "string") {
                setBucketSettings({ autoUpdateInterval: value });
            } else if (value && typeof value === "object" && (value as any).value) {
                // Edge case if store returns wrapped value
                const v = (value as any).value;
                if (typeof v === "string") setBucketSettings({ autoUpdateInterval: v });
            }
        } catch (e) {
            // Non-fatal: setting may not exist yet
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
        } catch (e) {
            setError("Failed to save auto-update interval.");
        } finally {
            setSaving(false);
        }
    };

    const handleSelect = (value: string) => {
        persistInterval(value);
    };

    onMount(() => {
        fetchInterval();
    });

    return (
        <Card
            title="Bucket Auto Update"
            icon={RefreshCcw}
            description="Rscoop will automatically run updates on all installed buckets to keep manifests fresh."
            headerAction={
                <div class="flex items-center gap-3">
                    <ActiveIntervalDisplay value={settings.buckets.autoUpdateInterval} />
                    {saving() && <span class="loading loading-spinner loading-xs" />}
                </div >
            }
        >
            <div class="flex flex-col gap-2">
                {INTERVAL_OPTIONS.map(opt => (
                    <label class="flex items-center justify-between bg-base-300/60 rounded-md px-3 py-2 cursor-pointer border border-base-content/50 hover:border-base-content/20 transition-colors">
                        <div class="flex flex-col">
                            <span class="text-sm font-medium">{opt.label}</span>
                            <span class="text-[10px] opacity-70">{opt.description}</span>
                        </div>
                        <input
                            type="radio"
                            name="bucketIntervalPreset"
                            value={opt.value}
                            checked={settings.buckets.autoUpdateInterval === opt.value}
                            disabled={loading() || saving()}
                            onChange={() => handleSelect(opt.value)}
                            class="radio radio-primary"
                        />
                    </label>
                ))}
            </div>

            {/* Custom interval */}
            <div class="mt-4 bg-base-300/40 rounded-md p-3 border border-dashed border-base-content/50">
                <span class="text-xs font-semibold uppercase tracking-wide opacity-90">Custom Interval</span>
                <p class="text-[11px] mt-1 mb-2 opacity-70">Define a custom schedule (minutes, hours, days, weeks).</p>
                <CustomIntervalEditor
                    currentValue={settings.buckets.autoUpdateInterval}
                    onPersist={persistInterval}
                    disabled={loading() || saving()}
                    debug={settings.debug.enabled}
                />
                <Show when={settings.debug.enabled}>
                    <div class="mt-3 flex items-center gap-2">
                        <button
                            type="button"
                            class="btn btn-xs btn-warning"
                            disabled={saving() || loading()}
                            onClick={() => persistInterval("custom:10")}
                        >
                            Debug: 10s Interval
                        </button>
                        <span class="text-[10px] opacity-60">Runs scheduler every 10 seconds (debug only)</span>
                    </div>
                </Show>
            </div>

            <Show when={settings.buckets.autoUpdateInterval !== 'off'}>
                <div class="divider my-4"></div>
                <div class="flex items-center justify-between">
                    <div class="flex flex-col">
                        <span class="text-sm font-medium">Auto Update Packages</span>
                        <span class="text-[11px] text-base-content/60">Run full package update after bucket refresh</span>
                    </div>
                    <label class="label cursor-pointer">
                        <input
                            type="checkbox"
                            class="toggle toggle-primary"
                            checked={settings.buckets.autoUpdatePackagesEnabled}
                            onChange={async (e) => {
                                setBucketSettings({ autoUpdatePackagesEnabled: e.currentTarget.checked });
                                await invoke("set_config_value", { key: "buckets.autoUpdatePackagesEnabled", value: e.currentTarget.checked });
                            }}
                        />
                    </label>
                </div>
                <div class="mt-2 text-[11px] text-base-content/50">
                    When enabled, after each scheduled bucket update Rscoop will update all installed packages.
                </div>
            </Show>

            {error() && <div class="alert alert-error mt-4 text-xs">{error()}</div>}
        </Card >
    );
}

interface CustomIntervalEditorProps {
    currentValue: string;
    onPersist: (newValue: string) => Promise<void> | void;
    disabled?: boolean;
    debug?: boolean;
}

function parseSeconds(value: string): number | null {
    if (value.startsWith("custom:")) {
        return value.substring(7).match(/^\d+$/) ? parseInt(value.substring(7), 10) : null;
    }
    if (/^\d+$/.test(value)) return parseInt(value, 10); // raw seconds
    const map: Record<string, number> = { "24h": 86400, "1d": 86400, "7d": 604800, "1w": 604800, "1h": 3600, "6h": 21600 };
    return map[value] ?? null;
}

function CustomIntervalEditor(props: CustomIntervalEditorProps) {
    const { currentValue, onPersist } = props;
    const [quantity, setQuantity] = createSignal(1);
    const [unit, setUnit] = createSignal("days");
    const [preview, setPreview] = createSignal<string>("");
    const [error, setError] = createSignal<string | null>(null);
    const [saving, setSaving] = createSignal(false);
    const [justSaved, setJustSaved] = createSignal(false);

    onMount(() => {
        const secs = parseSeconds(currentValue);
        if (secs) {
            // Try to map back to quantity/unit (prefer weeks, then days, hours, minutes)
            if (secs % 604800 === 0) { setQuantity(secs / 604800); setUnit("weeks"); }
            else if (secs % 86400 === 0) { setQuantity(secs / 86400); setUnit("days"); }
            else if (secs % 3600 === 0) { setQuantity(secs / 3600); setUnit("hours"); }
            else if (secs % 60 === 0) { setQuantity(secs / 60); setUnit("minutes"); }
        }
        updatePreview();
    });

    const unitSeconds = (u: string) => ({ minutes: 60, hours: 3600, days: 86400, weeks: 604800 }[u] || 0);

    const updatePreview = () => {
        const secs = quantity() * unitSeconds(unit());
        if (secs < 300) {
            setError("Minimum interval is 5 minutes (300 seconds).");
        } else {
            setError(null);
        }
        setPreview(`${secs} seconds (${formatHuman(secs)})`);
    };

    const formatHuman = (secs: number) => {
        if (secs % 604800 === 0) return `${secs / 604800} week(s)`;
        if (secs % 86400 === 0) return `${secs / 86400} day(s)`;
        if (secs % 3600 === 0) return `${secs / 3600} hour(s)`;
        if (secs % 60 === 0) return `${secs / 60} minute(s)`;
        return `${secs} sec`;
    };

    const handlePersist = async () => {
        const secs = quantity() * unitSeconds(unit());
        const minSecs = props.debug ? 10 : 300;
        if (secs < minSecs) { setError(`Interval too short (min ${minSecs}s).`); return; }
        setSaving(true);
        try {
            await onPersist(`custom:${secs}`);
            setJustSaved(true);
            setTimeout(() => setJustSaved(false), 2500);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div class="space-y-2">
            <div class="flex gap-2 items-end">
                <div class="flex-1">
                    <label class="label"><span class="label-text text-xs">Quantity</span></label>
                    <input
                        type="number"
                        min={1}
                        class="input input-sm input-bordered w-full"
                        value={quantity()}
                        disabled={props.disabled}
                        onInput={(e) => { setQuantity(parseInt(e.currentTarget.value || "1", 10)); updatePreview(); }}
                    />
                </div>
                <div class="flex-1">
                    <label class="label"><span class="label-text text-xs">Unit</span></label>
                    <select
                        class="select select-sm select-bordered w-full"
                        value={unit()}
                        disabled={props.disabled}
                        onChange={(e) => { setUnit(e.currentTarget.value); updatePreview(); }}
                    >
                        <option value="minutes">Minutes</option>
                        <option value="hours">Hours</option>
                        <option value="days">Days</option>
                        <option value="weeks">Weeks</option>
                    </select>
                </div>
                <button
                    type="button"
                    class="btn btn-sm btn-outline"
                    disabled={props.disabled || saving() || !!error()}
                    onClick={handlePersist}
                >
                    {saving() ? "Saving..." : justSaved() ? "Saved!" : "Save"}
                </button>
            </div>
            <div class="text-[11px] opacity-70">{preview()}</div>
            <Show when={!!error()}>
                <div class="text-error text-[11px]">{error()}</div>
            </Show>
            {/* Removed bottom Active badge per user request */}
        </div>
    );
}

function ActiveIntervalDisplay(props: { value: string }) {
    const human = () => formatIntervalDisplay(props.value);
    return (
        <div class="text-xs font-medium px-2 py-1 rounded bg-base-300 border border-base-content/10">
            Active: {human()}
        </div>
    );
}

function formatIntervalDisplay(raw: string): string {
    if (!raw || raw === 'off') return 'Off';
    if (raw === '24h' || raw === '1d') return '24 Hours';
    if (raw === '7d' || raw === '1w') return '7 Days';
    if (raw === '1h') return '1 Hour';
    if (raw === '6h') return '6 Hours';
    if (raw.startsWith('custom:')) {
        const secsStr = raw.substring(7);
        const secs = parseInt(secsStr, 10);
        if (!Number.isFinite(secs) || secs <= 0) return 'Custom';
        const week = 604800, day = 86400, hour = 3600, minute = 60;
        if (secs % week === 0) return `${secs / week} Week${secs / week === 1 ? '' : 's'}`;
        if (secs % day === 0) return `${secs / day} Day${secs / day === 1 ? '' : 's'}`;
        if (secs % hour === 0) return `${secs / hour} Hour${secs / hour === 1 ? '' : 's'}`;
        if (secs % minute === 0) return `${secs / minute} Minute${secs / minute === 1 ? '' : 's'}`;
        return `${secs} Sec`; // fallback
    }
    // Raw seconds fallback
    if (/^\d+$/.test(raw)) {
        const secs = parseInt(raw, 10);
        const week = 604800, day = 86400, hour = 3600, minute = 60;
        if (secs % week === 0) return `${secs / week} Week${secs / week === 1 ? '' : 's'}`;
        if (secs % day === 0) return `${secs / day} Day${secs / day === 1 ? '' : 's'}`;
        if (secs % hour === 0) return `${secs / hour} Hour${secs / hour === 1 ? '' : 's'}`;
        if (secs % minute === 0) return `${secs / minute} Minute${secs / minute === 1 ? '' : 's'}`;
        return `${secs} Sec`;
    }
    return raw; // Unknown format, display raw
}
import { createSignal, createMemo, For, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import {
    Package,
    Upload,
    Filter,
    Sparkles,
    Check,
    AlertTriangle,
    ClipboardCopy,
} from "lucide-solid";
import Modal from "../../common/Modal";
import { useI18n } from "../../../i18n";

const SCHEMA_VERSION = "1.0";

type GroupId =
    | "apps"
    | "buckets"
    | "holds"
    | "scoopConfig"
    | "appearance"
    | "window"
    | "tray"
    | "automation"
    | "updates"
    | "virustotal"
    | "path";

type Preset = "full" | "scoop" | "prefs" | "custom";

interface Group {
    id: GroupId;
    cat: "scoop" | "rscoop";
    title: string;
    sub: string;
    count: string;
    size: string;
    scoopCompat: boolean;
    sensitive: boolean;
}

// Mirrors the categories from the design's exim-data.js.
const GROUPS: Group[] = [
    { id: "apps", cat: "scoop", title: "Installed apps", sub: "name, bucket, version", count: "apps", size: "~12 KB", scoopCompat: true, sensitive: false },
    { id: "buckets", cat: "scoop", title: "Buckets", sub: "name + git source URL", count: "buckets", size: "~1 KB", scoopCompat: true, sensitive: false },
    { id: "holds", cat: "scoop", title: "Held / pinned packages", sub: "version-locked apps", count: "holds", size: "<1 KB", scoopCompat: false, sensitive: false },
    { id: "scoopConfig", cat: "scoop", title: "Scoop global config", sub: "~/.config/scoop/config.json", count: "keys", size: "~2 KB", scoopCompat: false, sensitive: true },
    { id: "appearance", cat: "rscoop", title: "Theme, language, launch page", sub: "dark / english / default page", count: "settings", size: "<1 KB", scoopCompat: false, sensitive: false },
    { id: "window", cat: "rscoop", title: "Window behavior", sub: "close-to-tray, launch on startup", count: "settings", size: "<1 KB", scoopCompat: false, sensitive: false },
    { id: "tray", cat: "rscoop", title: "Tray menu settings", sub: "pinned/hidden apps, state filters", count: "overrides", size: "~1 KB", scoopCompat: false, sensitive: false },
    { id: "automation", cat: "rscoop", title: "Automation rules", sub: "auto-cleanup, retention, cache, background", count: "rules", size: "~1 KB", scoopCompat: false, sensitive: false },
    { id: "updates", cat: "rscoop", title: "Bucket auto-update", sub: "interval, auto-update-packages", count: "settings", size: "<1 KB", scoopCompat: false, sensitive: false },
    { id: "virustotal", cat: "rscoop", title: "VirusTotal", sub: "enabled, auto-scan-on-install", count: "settings", size: "<1 KB", scoopCompat: false, sensitive: true },
    { id: "path", cat: "rscoop", title: "scoop_path override", sub: "custom install root", count: "setting", size: "<1 KB", scoopCompat: false, sensitive: false },
];

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export default function ExportProfileModal(props: Props) {
    const { t } = useI18n();

    // Default selection: everything except sensitive groups.
    const defaultSel = (): Set<GroupId> =>
        new Set(GROUPS.filter((g) => !g.sensitive).map((g) => g.id));

    const [selected, setSelected] = createSignal<Set<GroupId>>(defaultSel());
    const [preset, setPreset] = createSignal<Preset>("full");
    const [includeSecrets, setIncludeSecrets] = createSignal(false);
    const [busy, setBusy] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);
    const [savedPath, setSavedPath] = createSignal<string | null>(null);

    const applyPreset = (p: Preset) => {
        setPreset(p);
        if (p === "full") setSelected(new Set(GROUPS.map((g) => g.id)));
        else if (p === "scoop") setSelected(new Set(GROUPS.filter((g) => g.scoopCompat).map((g) => g.id)));
        else if (p === "prefs") setSelected(new Set(GROUPS.filter((g) => g.cat === "rscoop").map((g) => g.id)));
    };

    const toggle = (id: GroupId) => {
        setSelected((prev) => {
            const n = new Set(prev);
            n.has(id) ? n.delete(id) : n.add(id);
            return n;
        });
        setPreset("custom");
    };

    const selectedGroups = createMemo(() => GROUPS.filter((g) => selected().has(g.id)));
    const onlyScoopShape = createMemo(
        () => selectedGroups().length > 0 && selectedGroups().every((g) => g.scoopCompat),
    );
    const hasSensitive = createMemo(() => selectedGroups().some((g) => g.sensitive));
    const willExposeSecret = createMemo(() => hasSensitive() && includeSecrets());
    const suggestedName = createMemo(() =>
        onlyScoopShape()
            ? "scoopfile.json"
            : `rscoop-profile-${new Date().toISOString().slice(0, 10)}.rscoop.json`,
    );

    const handleSave = async () => {
        setError(null);
        setSavedPath(null);
        setBusy(true);
        try {
            const json = await invoke<string>("export_profile", {
                groups: Array.from(selected()),
                includeSecrets: includeSecrets(),
            });
            const path = await save({
                defaultPath: suggestedName(),
                filters: [{ name: "Profile JSON", extensions: ["json"] }],
            });
            if (!path) {
                setBusy(false);
                return;
            }
            await invoke("save_profile_file", { path, content: json });
            setSavedPath(path);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    const handleCopy = async () => {
        setError(null);
        setBusy(true);
        try {
            const json = await invoke<string>("export_profile", {
                groups: Array.from(selected()),
                includeSecrets: includeSecrets(),
            });
            await navigator.clipboard.writeText(json);
            setSavedPath("__clipboard__");
            setTimeout(() => setSavedPath(null), 2000);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    const resetAndClose = () => {
        setSelected(defaultSel());
        setPreset("full");
        setIncludeSecrets(false);
        setError(null);
        setSavedPath(null);
        props.onClose();
    };

    return (
        <Modal
            isOpen={props.isOpen}
            onClose={resetAndClose}
            title={
                <div class="flex items-center gap-2">
                    <Upload class="w-5 h-5 text-primary" />
                    {t("settings.exim.export.title")}
                </div>
            }
            size="large"
            headerAction={
                <span class="badge badge-sm badge-ghost font-mono">
                    schema v{SCHEMA_VERSION}
                </span>
            }
        >
            <div class="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
                {/* LEFT — composer */}
                <div class="flex flex-col gap-4 min-w-0">
                    <p class="text-sm text-base-content/70 mt-0">
                        {t("settings.exim.export.description")}
                    </p>

                    {/* Presets */}
                    <div>
                        <div class="text-xs font-semibold uppercase tracking-wider text-base-content/60 mb-2">
                            {t("settings.exim.export.presets")}
                        </div>
                        <div class="grid grid-cols-2 gap-2">
                            <PresetCard
                                active={preset() === "full"}
                                onClick={() => applyPreset("full")}
                                icon={<Package class="w-3 h-3" />}
                                title={t("settings.exim.export.presetFullTitle")}
                                sub={t("settings.exim.export.presetFullSub")}
                                count={GROUPS.length}
                            />
                            <PresetCard
                                active={preset() === "scoop"}
                                onClick={() => applyPreset("scoop")}
                                icon={<Package class="w-3 h-3" />}
                                title={t("settings.exim.export.presetScoopTitle")}
                                sub={t("settings.exim.export.presetScoopSub")}
                                count={GROUPS.filter((g) => g.scoopCompat).length}
                                badge={t("settings.exim.export.compatible")}
                            />
                            <PresetCard
                                active={preset() === "prefs"}
                                onClick={() => applyPreset("prefs")}
                                icon={<Filter class="w-3 h-3" />}
                                title={t("settings.exim.export.presetPrefsTitle")}
                                sub={t("settings.exim.export.presetPrefsSub")}
                                count={GROUPS.filter((g) => g.cat === "rscoop").length}
                            />
                            <PresetCard
                                active={preset() === "custom"}
                                onClick={() => setPreset("custom")}
                                icon={<Sparkles class="w-3 h-3" />}
                                title={t("settings.exim.export.presetCustomTitle")}
                                sub={t("settings.exim.export.presetCustomSub")}
                                count={selected().size}
                            />
                        </div>
                    </div>

                    {/* Contents */}
                    <div class="rounded-lg border border-base-200 overflow-hidden">
                        <div class="flex items-center px-4 py-2.5 border-b border-base-200 bg-base-200/40">
                            <div class="text-sm font-semibold">
                                {t("settings.exim.export.contents")}
                            </div>
                            <div class="flex-1" />
                            <div class="text-xs text-base-content/60">
                                {t("settings.exim.export.selectedCount", {
                                    n: selected().size,
                                    total: GROUPS.length,
                                })}
                            </div>
                        </div>

                        <GroupSection
                            title={t("settings.exim.export.sectionScoop")}
                            sub={t("settings.exim.export.sectionScoopSub")}
                            items={GROUPS.filter((g) => g.cat === "scoop")}
                            selected={selected()}
                            toggle={toggle}
                            includeSecrets={includeSecrets()}
                            setIncludeSecrets={setIncludeSecrets}
                        />
                        <GroupSection
                            title={t("settings.exim.export.sectionRscoop")}
                            sub={t("settings.exim.export.sectionRscoopSub")}
                            items={GROUPS.filter((g) => g.cat === "rscoop")}
                            selected={selected()}
                            toggle={toggle}
                            includeSecrets={includeSecrets()}
                            setIncludeSecrets={setIncludeSecrets}
                        />
                    </div>
                </div>

                {/* RIGHT — summary */}
                <aside class="flex flex-col gap-3 lg:sticky lg:top-0">
                    <div class="rounded-lg border border-base-200 overflow-hidden bg-base-200/30">
                        <div class="flex items-center px-4 py-3 border-b border-base-200">
                            <div class="text-sm font-semibold flex items-center gap-2">
                                <Package class="w-4 h-4 text-primary" />
                                {t("settings.exim.export.fileSummary")}
                            </div>
                            <div class="flex-1" />
                            <Show
                                when={onlyScoopShape()}
                                fallback={
                                    <span class="badge badge-sm badge-ghost">
                                        rScoop
                                    </span>
                                }
                            >
                                <span class="badge badge-sm badge-primary">
                                    {t("settings.exim.export.scoopCompat")}
                                </span>
                            </Show>
                        </div>

                        <div class="p-4 flex flex-col gap-3">
                            <div class="flex items-center gap-2.5">
                                <div class="w-9 h-9 rounded-md bg-primary/15 text-primary grid place-items-center shrink-0">
                                    <Package class="w-4 h-4" />
                                </div>
                                <div class="min-w-0 flex-1">
                                    <div
                                        class="font-mono text-xs truncate"
                                        title={suggestedName()}
                                    >
                                        {suggestedName()}
                                    </div>
                                    <div class="text-[10px] text-base-content/60 mt-0.5">
                                        JSON · schema v{SCHEMA_VERSION}
                                    </div>
                                </div>
                            </div>

                            <div class="h-px bg-base-200" />

                            <div class="text-[10px] uppercase tracking-wider text-base-content/60 font-semibold">
                                {t("settings.exim.export.whatsInside")}
                            </div>

                            <Show
                                when={selectedGroups().length > 0}
                                fallback={
                                    <div class="text-xs italic text-base-content/50">
                                        {t("settings.exim.export.nothingSelected")}
                                    </div>
                                }
                            >
                                <ul class="flex flex-col gap-1.5">
                                    <For each={selectedGroups()}>
                                        {(g) => (
                                            <li class="flex items-center gap-2 text-xs">
                                                <Check class="w-3 h-3 text-success shrink-0" />
                                                <span class="truncate flex-1">{g.title}</span>
                                                <span class="font-mono text-[10px] text-base-content/50 shrink-0">
                                                    {g.size}
                                                </span>
                                            </li>
                                        )}
                                    </For>
                                </ul>
                            </Show>

                            <Show when={willExposeSecret()}>
                                <div class="rounded-md border border-warning/40 bg-warning/10 p-2.5 flex gap-2 text-xs">
                                    <AlertTriangle class="w-4 h-4 text-warning shrink-0 mt-0.5" />
                                    <div>
                                        <div class="font-semibold text-warning mb-0.5">
                                            {t("settings.exim.export.secretsIncluded")}
                                        </div>
                                        <div class="text-warning/80">
                                            {t("settings.exim.export.secretsWarning")}
                                        </div>
                                    </div>
                                </div>
                            </Show>
                        </div>

                        <div class="px-4 py-3 border-t border-base-200 flex flex-col gap-2">
                            <button
                                class="btn btn-primary btn-sm w-full"
                                disabled={selected().size === 0 || busy()}
                                onClick={handleSave}
                            >
                                <Upload class="w-4 h-4" />
                                {busy() ? t("common.loading") : t("settings.exim.export.saveFile")}
                            </button>
                            <button
                                class="btn btn-ghost btn-sm w-full"
                                disabled={selected().size === 0 || busy()}
                                onClick={handleCopy}
                            >
                                <ClipboardCopy class="w-4 h-4" />
                                {t("settings.exim.export.copyClipboard")}
                            </button>
                        </div>
                    </div>

                    <Show when={error()}>
                        <div class="alert alert-error text-xs p-3">
                            {error()}
                        </div>
                    </Show>
                    <Show when={savedPath() === "__clipboard__"}>
                        <div class="alert alert-success text-xs p-3">
                            {t("settings.exim.export.copiedOk")}
                        </div>
                    </Show>
                    <Show when={savedPath() && savedPath() !== "__clipboard__"}>
                        <div class="alert alert-success text-xs p-3">
                            <Check class="w-4 h-4" />
                            <div class="min-w-0">
                                <div class="font-semibold">
                                    {t("settings.exim.export.savedOk")}
                                </div>
                                <div class="font-mono text-[10px] truncate opacity-80">
                                    {savedPath()}
                                </div>
                            </div>
                        </div>
                    </Show>

                    <div class="text-xs text-base-content/60 leading-relaxed px-1">
                        {t("settings.exim.export.aboutProfiles")}
                    </div>
                </aside>
            </div>
        </Modal>
    );
}

function PresetCard(p: {
    active: boolean;
    onClick: () => void;
    icon: any;
    title: string;
    sub: string;
    count: number;
    badge?: string;
}) {
    return (
        <button
            onClick={p.onClick}
            class="text-left p-3 rounded-lg border transition-colors flex flex-col gap-1 min-h-[88px] cursor-pointer"
            classList={{
                "bg-primary/10 border-primary/40": p.active,
                "bg-base-200/40 border-base-200 hover:bg-base-200/60": !p.active,
            }}
        >
            <div class="flex items-center gap-1.5">
                <div
                    class="w-5 h-5 rounded grid place-items-center shrink-0"
                    classList={{
                        "bg-primary text-primary-content": p.active,
                        "bg-base-100 text-primary": !p.active,
                    }}
                >
                    {p.icon}
                </div>
                <div class="text-sm font-semibold flex-1">{p.title}</div>
                <Show when={p.active}>
                    <Check class="w-3.5 h-3.5 text-primary" />
                </Show>
            </div>
            <div class="text-xs text-base-content/70 leading-snug">{p.sub}</div>
            <div class="mt-auto text-[10px] text-base-content/50 flex items-center gap-1.5">
                <span class="font-mono">{p.count} groups</span>
                <Show when={p.badge}>
                    <span class="text-primary">· {p.badge}</span>
                </Show>
            </div>
        </button>
    );
}

function GroupSection(p: {
    title: string;
    sub: string;
    items: Group[];
    selected: Set<GroupId>;
    toggle: (id: GroupId) => void;
    includeSecrets: boolean;
    setIncludeSecrets: (v: boolean) => void;
}) {
    const { t } = useI18n();
    return (
        <div>
            <div class="px-4 py-2 bg-base-200/30 border-b border-base-200">
                <div class="text-[11px] font-semibold uppercase tracking-wider text-base-content/70">
                    {p.title}
                </div>
                <div class="text-[11px] text-base-content/50 mt-0.5">{p.sub}</div>
            </div>
            <For each={p.items}>
                {(g) => {
                    const on = () => p.selected.has(g.id);
                    return (
                        <div
                            class="flex items-center gap-3 px-4 py-2.5 border-b border-base-200/50 last:border-b-0 transition-opacity"
                            classList={{ "opacity-60": !on() }}
                        >
                            <div
                                onClick={() => p.toggle(g.id)}
                                class="w-[18px] h-[18px] rounded border-[1.5px] grid place-items-center shrink-0 cursor-pointer"
                                classList={{
                                    "border-primary bg-primary": on(),
                                    "border-base-content/30": !on(),
                                }}
                            >
                                <Show when={on()}>
                                    <Check class="w-3 h-3 text-primary-content" />
                                </Show>
                            </div>
                            <div
                                class="flex-1 min-w-0 cursor-pointer"
                                onClick={() => p.toggle(g.id)}
                            >
                                <div class="text-sm flex items-center gap-2 flex-wrap">
                                    <span class="font-medium">{g.title}</span>
                                    <Show when={g.scoopCompat}>
                                        <span class="badge badge-xs badge-primary">
                                            scoop
                                        </span>
                                    </Show>
                                    <Show when={g.sensitive}>
                                        <span class="badge badge-xs badge-warning">
                                            {t("settings.exim.export.containsSecret")}
                                        </span>
                                    </Show>
                                </div>
                                <div class="text-[11px] text-base-content/60 mt-0.5">
                                    {g.sub}
                                </div>
                            </div>
                            <Show when={on() && g.sensitive}>
                                <label class="flex items-center gap-2 px-2.5 py-1 rounded-md bg-warning/10 border border-warning/30 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        class="toggle toggle-xs toggle-warning"
                                        checked={p.includeSecrets}
                                        onChange={(e) =>
                                            p.setIncludeSecrets(e.currentTarget.checked)
                                        }
                                    />
                                    <span class="text-[11px] text-warning">
                                        {t("settings.exim.export.includeApiKey")}
                                    </span>
                                </label>
                            </Show>
                        </div>
                    );
                }}
            </For>
        </div>
    );
}

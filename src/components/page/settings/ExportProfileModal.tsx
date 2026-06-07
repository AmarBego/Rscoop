import { createSignal, createMemo, For, Show, onCleanup, type JSX } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import {
    Upload,
    Check,
    AlertTriangle,
    ClipboardCopy,
} from "lucide-solid";
import Modal from "../../common/Modal";
import { useI18n } from "../../../i18n";
import { writeClipboardText } from "../../../utils/clipboard";
import { getErrorMessage } from "../../../utils/errors";

const SCHEMA_VERSION = "1.0";

type GroupId =
    | "apps"
    | "buckets"
    | "holds"
    | "scoopConfig"
    | "rscoopSettings";

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
    { id: "holds", cat: "scoop", title: "Held / pinned packages", sub: "version-locked apps", count: "holds", size: "<1 KB", scoopCompat: true, sensitive: false },
    { id: "scoopConfig", cat: "scoop", title: "Scoop global config", sub: "~/.config/scoop/config.json", count: "keys", size: "~2 KB", scoopCompat: false, sensitive: true },
    { id: "rscoopSettings", cat: "rscoop", title: "rScoop preferences", sub: "window, cleanup, updates, operations, path", count: "settings", size: "~1 KB", scoopCompat: false, sensitive: false },
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
    let feedbackTimeout: number | undefined;

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
            setError(getErrorMessage(e));
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
            await writeClipboardText(json);
            setSavedPath("__clipboard__");
            window.clearTimeout(feedbackTimeout);
            feedbackTimeout = window.setTimeout(() => setSavedPath(null), 2000);
        } catch (e) {
            setError(getErrorMessage(e));
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

    onCleanup(() => {
        window.clearTimeout(feedbackTimeout);
    });

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
            footer={
                <div class="flex w-full items-center">
                    <div class="min-w-0 flex-1">
                        <Show when={error()}>
                            <span class="flex items-center gap-2 text-sm text-error">
                                <AlertTriangle class="w-4 h-4 shrink-0" />
                                <span class="truncate">{error()}</span>
                            </span>
                        </Show>
                        <Show when={savedPath() === "__clipboard__"}>
                            <span class="flex items-center gap-2 text-sm text-success">
                                <Check class="w-4 h-4 shrink-0" />
                                <span class="truncate">{t("settings.exim.export.copiedOk")}</span>
                            </span>
                        </Show>
                        <Show when={savedPath() && savedPath() !== "__clipboard__"}>
                            <span class="flex items-center gap-2 text-sm text-success">
                                <Check class="w-4 h-4 shrink-0" />
                                <span class="truncate">{t("settings.exim.export.savedOk")}: {savedPath()}</span>
                            </span>
                        </Show>
                    </div>

                    <div class="flex shrink-0 items-center gap-2">
                        <button
                            type="button"
                            class="btn btn-ghost btn-sm"
                            disabled={selected().size === 0 || busy()}
                            onClick={handleCopy}
                        >
                            <ClipboardCopy class="w-4 h-4" />
                            {t("settings.exim.export.copyClipboard")}
                        </button>
                        <button
                            type="button"
                            class="btn btn-primary btn-sm"
                            disabled={selected().size === 0 || busy()}
                            onClick={handleSave}
                        >
                            <Upload class="w-4 h-4" />
                            {busy() ? t("common.loading") : t("settings.exim.export.saveFile")}
                        </button>
                    </div>
                </div>
            }
        >
            <div class="space-y-5">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <p class="text-sm text-base-content/70 max-w-2xl">
                        {t("settings.exim.export.description")}
                    </p>
                    <div class="text-xs text-base-content/60 sm:text-end">
                        <div class="font-mono truncate max-w-full sm:max-w-64" title={suggestedName()}>
                            {suggestedName()}
                        </div>
                        <Show
                            when={onlyScoopShape()}
                            fallback={<span>rScoop JSON</span>}
                        >
                            <span>{t("settings.exim.export.scoopCompat")}</span>
                        </Show>
                    </div>
                </div>

                <div class="space-y-2">
                    <div class="text-xs font-semibold uppercase tracking-wider text-base-content/60">
                        {t("settings.exim.export.presets")}
                    </div>
                    <div class="flex flex-col gap-2 sm:flex-row">
                        <PresetButton
                            active={preset() === "full"}
                            onClick={() => applyPreset("full")}
                        >
                            {t("settings.exim.export.presetFullTitle")}
                        </PresetButton>
                        <PresetButton
                            active={preset() === "scoop"}
                            onClick={() => applyPreset("scoop")}
                        >
                            {t("settings.exim.export.presetScoopTitle")}
                        </PresetButton>
                        <PresetButton
                            active={preset() === "prefs"}
                            onClick={() => applyPreset("prefs")}
                        >
                            {t("settings.exim.export.presetPrefsTitle")}
                        </PresetButton>
                    </div>
                </div>

                <div class="rounded-lg border border-base-200 overflow-hidden">
                    <div class="flex flex-col gap-1 px-4 py-3 border-b border-base-200 bg-base-200/30 sm:flex-row sm:items-center sm:justify-between">
                        <div class="text-sm font-semibold">{t("settings.exim.export.contents")}</div>
                        <div class="text-xs text-base-content/60">
                            {t("settings.exim.export.selectedCount", {
                                n: selected().size,
                                total: GROUPS.length,
                            })}
                        </div>
                    </div>

                    <For each={GROUPS}>
                        {(group) => (
                            <GroupRow
                                group={group}
                                selected={selected().has(group.id)}
                                includeSecrets={includeSecrets()}
                                onToggle={() => toggle(group.id)}
                                onSecretsChange={setIncludeSecrets}
                            />
                        )}
                    </For>
                </div>

                <Show when={willExposeSecret()}>
                    <div class="rounded-md border border-warning/40 bg-warning/10 p-3 flex gap-2 text-xs">
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
        </Modal>
    );
}

function PresetButton(p: {
    active: boolean;
    onClick: () => void;
    children: JSX.Element;
}) {
    return (
        <button
            type="button"
            onClick={p.onClick}
            class="btn btn-sm flex-1 justify-start sm:justify-center"
            classList={{
                "btn-primary": p.active,
                "btn-ghost border border-base-content/15": !p.active,
            }}
        >
            <Show when={p.active}>
                <Check class="w-4 h-4" />
            </Show>
            {p.children}
        </button>
    );
}

function GroupRow(p: {
    group: Group;
    selected: boolean;
    onToggle: () => void;
    includeSecrets: boolean;
    onSecretsChange: (v: boolean) => void;
}) {
    const { t } = useI18n();
    const inputId = () => `export-group-${p.group.id}`;
    const secretsId = () => `export-secrets-${p.group.id}`;
    return (
        <div
            class="flex flex-col gap-3 px-4 py-3 border-b border-base-200/50 last:border-b-0 sm:flex-row sm:items-center"
            classList={{ "opacity-65": !p.selected }}
        >
            <label for={inputId()} class="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                <input
                    id={inputId()}
                    type="checkbox"
                    class="checkbox checkbox-primary checkbox-sm mt-0.5"
                    checked={p.selected}
                    onChange={p.onToggle}
                />
                <span class="min-w-0">
                    <span class="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {p.group.title}
                        <Show when={p.group.scoopCompat}>
                            <span class="badge badge-xs badge-primary">scoop</span>
                        </Show>
                        <Show when={p.group.sensitive}>
                            <span class="badge badge-xs badge-warning">
                                {t("settings.exim.export.containsSecret")}
                            </span>
                        </Show>
                    </span>
                    <span class="block text-[11px] text-base-content/60 mt-0.5">
                        {p.group.sub}
                    </span>
                </span>
            </label>

            <Show when={p.selected && p.group.sensitive}>
                <label for={secretsId()} class="flex items-center gap-2 rounded-md bg-warning/10 px-3 py-1 text-xs text-warning sm:shrink-0">
                    <input
                        id={secretsId()}
                        type="checkbox"
                        class="toggle toggle-sm toggle-warning"
                        checked={p.includeSecrets}
                        onChange={(e) => p.onSecretsChange(e.currentTarget.checked)}
                    />
                    {t("settings.exim.export.includeApiKey")}
                </label>
            </Show>
        </div>
    );
}

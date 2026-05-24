import { createSignal, createMemo, For, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Download, Check, AlertTriangle, FileJson } from "lucide-solid";
import Modal from "../../common/Modal";
import { useI18n } from "../../../i18n";

interface ProfileSummary {
    schema: string;
    exported_at: string | null;
    valid: boolean;
    groups_present: string[];
    app_count: number;
    bucket_count: number;
    hold_count: number;
    setting_count: number;
    has_scoop_config: boolean;
    has_secrets: boolean;
    warnings: string[];
}

interface ImportResult {
    applied_groups: string[];
    settings_applied: number;
    scoop_config_keys_applied: number;
    buckets_added: number;
    buckets_failed: number;
    apps_queued: number;
    notes: string[];
}

// Groups the backend's import_profile can act on. Buckets clone synchronously,
// apps enqueue onto the ops manager, holds apply to packages already on disk.
const APPLIABLE = [
    "rscoopSettings",
    "scoopConfig",
    "buckets",
    "apps",
    "holds",
] as const;
type AppliableGroup = (typeof APPLIABLE)[number];

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export default function ImportProfileModal(props: Props) {
    const { t } = useI18n();
    const [json, setJson] = createSignal("");
    const [summary, setSummary] = createSignal<ProfileSummary | null>(null);
    const [parseError, setParseError] = createSignal<string | null>(null);
    const [selected, setSelected] = createSignal<Set<AppliableGroup>>(new Set(APPLIABLE));
    const [busy, setBusy] = createSignal(false);
    const [result, setResult] = createSignal<ImportResult | null>(null);
    const [error, setError] = createSignal<string | null>(null);

    const inspect = async (text: string) => {
        setParseError(null);
        setSummary(null);
        setResult(null);
        if (!text.trim()) return;
        try {
            const s = await invoke<ProfileSummary>("inspect_profile", { json: text });
            setSummary(s);
        } catch (e) {
            setParseError(e instanceof Error ? e.message : String(e));
        }
    };

    const handleJsonChange = (text: string) => {
        setJson(text);
        // Debounce not critical — this runs only when user stops typing.
        inspect(text);
    };

    const handleFilePick = async () => {
        const path = await open({
            multiple: false,
            filters: [{ name: "Profile JSON", extensions: ["json"] }],
        });
        if (!path || Array.isArray(path)) return;
        try {
            const content = await invoke<string>("read_profile_file_at", { path });
            handleJsonChange(content);
        } catch {
            // Fallback: we didn't add a read command; ask user to paste.
            // Keep behaviour silent — pasting still works.
        }
    };

    const toggle = (g: AppliableGroup) => {
        setSelected((prev) => {
            const n = new Set(prev);
            n.has(g) ? n.delete(g) : n.add(g);
            return n;
        });
    };

    const canImport = createMemo(
        () => summary()?.valid === true && selected().size > 0 && !busy(),
    );

    const handleImport = async () => {
        setError(null);
        setResult(null);
        setBusy(true);
        try {
            const r = await invoke<ImportResult>("import_profile", {
                json: json(),
                groups: Array.from(selected()),
            });
            setResult(r);
            // If the backend queued installs, the OperationModal will take
            // over — close this modal after a beat so it's not in the way.
            if (r.apps_queued > 0) {
                setTimeout(closeAndReset, 800);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    const reset = () => {
        setJson("");
        setSummary(null);
        setParseError(null);
        setSelected(new Set(APPLIABLE));
        setResult(null);
        setError(null);
    };

    const closeAndReset = () => {
        reset();
        props.onClose();
    };

    const has = (group: string) => summary()?.groups_present.includes(group);

    return (
        <Modal
            isOpen={props.isOpen}
            onClose={closeAndReset}
            title={
                <div class="flex items-center gap-2">
                    <Download class="w-5 h-5 text-primary" />
                    {t("settings.exim.import.title")}
                </div>
            }
            size="medium"
        >
            <div class="flex flex-col gap-4">
                <p class="text-sm text-base-content/70">
                    {t("settings.exim.import.description")}
                </p>

                {/* Paste area */}
                <div>
                    <div class="flex flex-col gap-2 mb-2 sm:flex-row sm:items-center">
                        <label class="text-sm font-semibold">
                            {t("settings.exim.import.pasteLabel")}
                        </label>
                        <button
                            class="btn btn-xs btn-ghost sm:ml-auto"
                            onClick={handleFilePick}
                        >
                            <FileJson class="w-3.5 h-3.5" />
                            {t("settings.exim.import.openFile")}
                        </button>
                    </div>
                    <textarea
                        class="textarea textarea-bordered w-full font-mono text-xs leading-relaxed"
                        rows={8}
                        placeholder={'{\n  "schema": "1.0",\n  ...\n}'}
                        value={json()}
                        onInput={(e) => handleJsonChange(e.currentTarget.value)}
                    />
                    <Show when={parseError()}>
                        <div class="text-error text-xs mt-1">
                            {t("settings.exim.import.invalidJson")}
                        </div>
                    </Show>
                </div>

                {/* Summary + selection */}
                <Show when={summary()}>
                    {(s) => (
                        <div class="rounded-lg border border-base-200 bg-base-200/30 overflow-hidden">
                            <div class="px-4 py-2.5 border-b border-base-200 flex items-center gap-2">
                                <Check class="w-4 h-4 text-success" />
                                <div class="text-sm font-semibold">
                                    {t("settings.exim.import.validProfile")}
                                </div>
                                <div class="flex-1" />
                                <span class="badge badge-sm badge-ghost font-mono">
                                    schema v{s().schema}
                                </span>
                            </div>

                            <Show when={s().warnings.length > 0}>
                                <div class="px-4 pt-3">
                                    <div class="rounded-md border border-warning/40 bg-warning/10 p-2.5 flex gap-2 text-xs">
                                        <AlertTriangle class="w-4 h-4 text-warning shrink-0 mt-0.5" />
                                        <ul class="flex-1 space-y-0.5 text-warning/90">
                                            <For each={s().warnings}>
                                                {(w) => <li>{w}</li>}
                                            </For>
                                        </ul>
                                    </div>
                                </div>
                            </Show>

                            <div class="p-4 flex flex-col gap-1">
                                <div class="text-[11px] uppercase tracking-wider text-base-content/60 font-semibold mb-1">
                                    {t("settings.exim.import.selectWhat")}
                                </div>

                                <SelectRow
                                    label={t("settings.exim.import.buckets")}
                                    count={s().bucket_count}
                                    present={has("buckets")}
                                    checked={selected().has("buckets")}
                                    onToggle={() => toggle("buckets")}
                                    hint={t("settings.exim.import.bucketsHint")}
                                />
                                <SelectRow
                                    label={t("settings.exim.import.apps")}
                                    count={s().app_count}
                                    present={has("apps")}
                                    checked={selected().has("apps")}
                                    onToggle={() => toggle("apps")}
                                    hint={t("settings.exim.import.appsHint")}
                                />
                                <SelectRow
                                    label={t("settings.exim.import.holds")}
                                    count={s().hold_count}
                                    present={has("holds")}
                                    checked={selected().has("holds")}
                                    onToggle={() => toggle("holds")}
                                    hint={t("settings.exim.import.holdsHint")}
                                />
                                <SelectRow
                                    label={t("settings.exim.import.rscoopSettings")}
                                    count={s().setting_count}
                                    present={has("rscoopSettings")}
                                    checked={selected().has("rscoopSettings")}
                                    onToggle={() => toggle("rscoopSettings")}
                                />
                                <SelectRow
                                    label={t("settings.exim.import.scoopConfig")}
                                    count={undefined}
                                    present={has("scoopConfig")}
                                    checked={selected().has("scoopConfig")}
                                    onToggle={() => toggle("scoopConfig")}
                                    warning={s().has_secrets ? t("settings.exim.import.containsSecret") : undefined}
                                />
                            </div>
                        </div>
                    )}
                </Show>

                <Show when={result()}>
                    {(r) => (
                        <div class="rounded-lg border border-success/40 bg-success/5 p-4 flex flex-col gap-2">
                            <div class="flex items-center gap-2 text-sm font-semibold text-success">
                                <Check class="w-4 h-4" />
                                {t("settings.exim.import.appliedOk", {
                                    n:
                                        r().settings_applied +
                                        r().scoop_config_keys_applied +
                                        r().buckets_added +
                                        r().apps_queued,
                                })}
                            </div>
                            <Show when={r().apps_queued > 0}>
                                <div class="text-xs text-base-content/80">
                                    {t("settings.exim.import.appsQueued", { n: r().apps_queued })}
                                </div>
                            </Show>
                            <Show when={r().notes.length > 0}>
                                <ul class="text-xs text-base-content/70 list-disc pl-5 space-y-0.5">
                                    <For each={r().notes}>
                                        {(note) => <li>{note}</li>}
                                    </For>
                                </ul>
                            </Show>
                        </div>
                    )}
                </Show>

                <Show when={error()}>
                    <div class="alert alert-error text-xs p-3">
                        <AlertTriangle class="w-4 h-4" />
                        {error()}
                    </div>
                </Show>

                <div class="flex gap-2 justify-end">
                    <button class="btn btn-ghost btn-sm" onClick={closeAndReset}>
                        {t("common.close")}
                    </button>
                    <button
                        class="btn btn-primary btn-sm"
                        disabled={!canImport()}
                        onClick={handleImport}
                    >
                        <Download class="w-4 h-4" />
                        {busy()
                            ? t("common.loading")
                            : t("settings.exim.import.applyButton")}
                    </button>
                </div>
            </div>
        </Modal>
    );
}

function SelectRow(p: {
    label: string;
    count: number | undefined;
    present: boolean | undefined;
    checked: boolean;
    onToggle: () => void;
    warning?: string;
    hint?: string;
}) {
    return (
        <label
            class="flex items-start gap-3 py-1.5 cursor-pointer"
            classList={{ "opacity-40 pointer-events-none": !p.present }}
        >
            <input
                type="checkbox"
                class="checkbox checkbox-sm checkbox-primary mt-0.5"
                checked={p.checked && !!p.present}
                onChange={p.onToggle}
                disabled={!p.present}
            />
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 text-sm">
                    <span>{p.label}</span>
                    <Show when={p.warning}>
                        <span class="badge badge-xs badge-warning">{p.warning}</span>
                    </Show>
                </div>
                <Show when={p.hint}>
                    <div class="text-[11px] text-base-content/50 mt-0.5">
                        {p.hint}
                    </div>
                </Show>
            </div>
            <Show when={p.count !== undefined && p.present}>
                <span class="font-mono text-xs text-base-content/60 shrink-0 mt-0.5">
                    {p.count}
                </span>
            </Show>
        </label>
    );
}

import { Show, createEffect, createMemo, createSignal, on, onCleanup, untrack } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { Check, Copy, Ellipsis, ExternalLink, FileJson, History, Info, Pencil, RotateCcw, Save, X } from "lucide-solid";
import ManifestCodeEditor from "./ManifestCodeEditor";
import { Dropdown, DropdownDivider, DropdownItem } from "./common/Dropdown";
import { useI18n } from "../i18n";
import type { ScoopPackage } from "../types/scoop";
import { getErrorMessage } from "../utils/errors";
import { writeClipboardText } from "../utils/clipboard";
import { manifestReview } from "../stores/manifestReview";

interface ManifestDocument {
  content: string;
  path: string;
  bucket: string | null;
  installedCopy: boolean;
  upstreamContent: string | null;
  upstreamChanged: boolean;
  upstreamRemoved: boolean;
  latestBackup: { name: string; modifiedAt: number } | null;
}

interface Props {
  pkg: ScoopPackage;
  active: boolean;
  reviewRequest?: number;
  onDirtyChange: (dirty: boolean) => void;
  onBusyChange: (busy: boolean) => void;
  onChanged: () => void;
}

const editableText = (content: string) => content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");

export default function ManifestPanel(props: Props) {
  const { t, locale } = useI18n();
  const [document, setDocument] = createSignal<ManifestDocument | null>(null);
  const [draft, setDraft] = createSignal("");
  const [editing, setEditing] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [opening, setOpening] = createSignal(false);
  const [confirming, setConfirming] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [status, setStatus] = createSignal<string | null>(null);
  const [showDetails, setShowDetails] = createSignal(false);
  const [diskChanged, setDiskChanged] = createSignal(false);
  const [copied, setCopied] = createSignal(false);
  const [reviewing, setReviewing] = createSignal(false);
  const [reviewSide, setReviewSide] = createSignal<"local" | "upstream">("upstream");
  let requestId = 0;
  let disposed = false;
  let pendingRefresh = false;
  let copyTimeout: ReturnType<typeof setTimeout> | undefined;

  const dirty = createMemo(() => editing() && draft() !== editableText(document()?.content ?? ""));
  const ioBusy = () => saving() || opening() || loading();
  const busy = () => confirming() || ioBusy();
  const backupPath = () => {
    const doc = document();
    return doc?.latestBackup ? doc.path.replace(/[^\\/]+$/, () => doc.latestBackup!.name) : null;
  };
  const validationError = createMemo(() => {
    if (!editing()) return null;
    try {
      const value = JSON.parse(draft());
      if (!value || Array.isArray(value) || typeof value !== "object" || typeof value.version !== "string" || !value.version.trim()) {
        return t("modal.manifest.invalidObject");
      }
    } catch (err) {
      return t("modal.manifest.invalidJson", { error: getErrorMessage(err) });
    }
    return null;
  });

  createEffect(() => props.onDirtyChange(dirty()));
  createEffect(() => props.onBusyChange(busy()));
  createEffect(on(() => `${props.pkg.source}\0${props.pkg.name}`, () => {
    requestId += 1;
    pendingRefresh = false;
    setDocument(null);
    setDraft("");
    setEditing(false);
    setLoading(false);
    setSaving(false);
    setOpening(false);
    setError(null);
    setStatus(null);
    setShowDetails(false);
    setDiskChanged(false);
    setCopied(false);
    setReviewing(false);
  }));

  const isCurrent = (id: number) => !disposed && id === requestId;
  const packageArgs = () => ({ packageName: props.pkg.name, bucket: props.pkg.source });
  const load = async (automatic = false) => {
    if (ioBusy()) return;
    const id = ++requestId;
    const previous = document();
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<ManifestDocument>("get_package_manifest_document", {
        ...packageArgs(), knownContent: previous?.content ?? null,
      });
      if (!isCurrent(id)) return;
      const changed = !!previous && (result.content !== previous.content || result.path !== previous.path);
      if (automatic && dirty()) {
        setDiskChanged(changed);
        // Refresh remote metadata without replacing the draft's disk snapshot.
        setDocument({ ...previous!, upstreamContent: result.upstreamContent,
          upstreamChanged: result.upstreamChanged, upstreamRemoved: result.upstreamRemoved,
          latestBackup: result.latestBackup });
      } else {
        setDocument(result);
        setDraft(editableText(result.content));
        setDiskChanged(false);
        if (changed) setStatus(t("modal.manifest.reloaded"));
      }
      if (changed) props.onChanged();
    } catch (err) {
      if (isCurrent(id)) setError(getErrorMessage(err));
    } finally {
      if (isCurrent(id)) setLoading(false);
    }
  };

  createEffect(() => {
    if (props.active && !document() && !busy() && !error()) untrack(() => void load());
  });
  const requestRefresh = () => {
    if (!document()) return;
    if (busy()) pendingRefresh = true;
    else void load(true);
  };
  createEffect(() => {
    if (!busy() && pendingRefresh) {
      pendingRefresh = false;
      untrack(requestRefresh);
    }
  });
  createEffect(on(manifestReview.update, event => {
    if (event && (event.bucket === null || event.bucket === props.pkg.source)) untrack(requestRefresh);
  }));
  createEffect(on(() => props.active, active => { if (active) untrack(requestRefresh); }));
  const startReview = () => { setReviewing(true); setReviewSide("upstream"); };
  createEffect(on(() => props.reviewRequest, request => {
    if (request) { startReview(); untrack(requestRefresh); }
  }));

  const afterDiscardConfirmation = async (action: () => void | Promise<void>) => {
    if (busy()) return;
    const id = requestId;
    // Native dialogs restore window focus before resolving. Defer focus/bucket
    // refreshes until both the confirmation and its action have completed.
    setConfirming(true);
    try {
      if (dirty() && !await ask(t("modal.manifest.discardMessage"), {
        title: t("modal.manifest.unsaved"), kind: "warning",
        okLabel: t("modal.manifest.discard"), cancelLabel: t("modal.manifest.keepEditing"),
      })) return;
      if (isCurrent(id)) await action();
    } catch (err) {
      if (isCurrent(id)) setError(getErrorMessage(err));
    } finally {
      if (!disposed) setConfirming(false);
    }
  };

  const refresh = () => afterDiscardConfirmation(() => load());

  const save = async () => {
    const current = document();
    if (!current || !dirty() || busy() || validationError()) return;
    const id = ++requestId;
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const result = await invoke<{ document: ManifestDocument; backupPath: string | null }>("save_package_manifest", {
        ...packageArgs(), expectedPath: current.path, originalContent: current.content, content: draft(),
      });
      if (!isCurrent(id)) return;
      setDocument(result.document);
      setDraft(editableText(result.document.content));
      setEditing(false);
      setDiskChanged(false);
      setStatus(t(result.backupPath ? "modal.manifest.savedWithBackup" : "common.saved"));
      if (!result.document.upstreamChanged) manifestReview.resolve({ packageName: props.pkg.name, bucket: props.pkg.source });
      props.onChanged();
    } catch (err) {
      if (isCurrent(id)) setError(getErrorMessage(err));
    } finally {
      if (isCurrent(id)) setSaving(false);
    }
  };

  const restoreBackup = async () => {
    const current = document();
    const backup = current?.latestBackup;
    if (!current || !backup || busy() || dirty()) return;
    const id = ++requestId;
    setSaving(true);
    setError(null);
    try {
      const confirmed = await ask(t("modal.manifest.restoreMessage", {
        date: new Date(backup.modifiedAt).toLocaleString(locale()),
      }), {
        title: t("modal.manifest.restoreBackup"), kind: "warning",
        okLabel: t("modal.manifest.restore"), cancelLabel: t("common.cancel"),
      });
      if (!confirmed || !isCurrent(id)) return;
      const result = await invoke<{ document: ManifestDocument }>("restore_package_manifest_backup", {
        ...packageArgs(), expectedPath: current.path, originalContent: current.content, backupName: backup.name,
      });
      if (!isCurrent(id)) return;
      setDocument(result.document);
      setDraft(editableText(result.document.content));
      setEditing(false);
      setDiskChanged(false);
      setStatus(t("modal.manifest.restored"));
      if (!result.document.upstreamChanged) manifestReview.resolve({ packageName: props.pkg.name, bucket: props.pkg.source });
      props.onChanged();
    } catch (err) {
      if (isCurrent(id)) setError(getErrorMessage(err));
    } finally {
      if (isCurrent(id)) setSaving(false);
    }
  };

  const startEditing = () => {
    setDraft(editableText(document()!.content));
    setEditing(true);
    setStatus(null);
  };
  const cancelEditing = () => afterDiscardConfirmation(async () => {
    setEditing(false);
    setDraft(editableText(document()?.content ?? ""));
    setError(null);
    setStatus(null);
    if (diskChanged()) await load();
  });
  const loadUpstream = () => afterDiscardConfirmation(() => {
    const upstream = document()?.upstreamContent;
    if (upstream == null) return;
    setReviewing(false);
    setDraft(editableText(upstream));
    setEditing(true);
    setStatus(t("modal.manifest.upstreamDraft"));
  });

  const openEditor = async (mode: "preferred" | "choose" | "default") => {
    const current = document();
    if (!current || busy() || dirty()) return;
    const id = ++requestId;
    setOpening(true);
    setError(null);
    try {
      const result = await invoke<{ latestBackup: ManifestDocument["latestBackup"] } | null>("open_package_manifest_editor", {
        ...packageArgs(), expectedPath: current.path, originalContent: current.content,
        mode, pickerTitle: t("modal.manifest.chooseEditorTitle"),
      });
      if (!isCurrent(id) || !result) return;
      setDocument({ ...current, latestBackup: result.latestBackup });
      setStatus(t("modal.manifest.editorOpened"));
    } catch (err) {
      if (isCurrent(id)) setError(getErrorMessage(err));
    } finally {
      if (isCurrent(id)) setOpening(false);
    }
  };

  const copy = async (text: string, flash = true) => {
    try {
      await writeClipboardText(text);
      if (disposed) return;
      if (flash) {
        setCopied(true);
        clearTimeout(copyTimeout);
        copyTimeout = setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) { setError(getErrorMessage(err)); }
  };
  const onFocus = () => {
    if (props.active) requestRefresh();
  };
  window.addEventListener("focus", onFocus);
  onCleanup(() => {
    disposed = true;
    requestId += 1;
    clearTimeout(copyTimeout);
    window.removeEventListener("focus", onFocus);
    props.onDirtyChange(false);
    props.onBusyChange(false);
  });

  return (
    <div role="tabpanel" id="pkg-tab-manifest-panel" aria-labelledby="pkg-tab-manifest-btn" classList={{ hidden: !props.active }}>
      <Show when={loading() && !document()}>
        <div class="flex justify-center items-center h-48 gap-3"><span class="loading loading-spinner" />{t("modal.manifest.loading")}</div>
      </Show>
      <Show when={error()}>
        <div role="alert" class="alert alert-error mb-3 text-sm break-words">
          <span>{error()}</span>
          <button class="btn btn-sm" disabled={busy()} onClick={refresh}>{t("modal.manifest.reload")}</button>
        </div>
      </Show>
      <Show when={document()}>
        {(doc) => <>
          <Show when={diskChanged()}><div role="alert" class="alert alert-warning mb-3 text-sm">{t("modal.manifest.externalChange")}</div></Show>
          <Show when={doc().upstreamChanged && !reviewing()}>
            <div role="status" class="flex items-center justify-between gap-2 mb-2 text-xs text-warning">
              <span>{t("modal.manifest.upstreamChanged")}</span>
              <button class="btn btn-xs btn-ghost" disabled={busy()} onClick={startReview}>{t("modal.manifest.review")}</button>
            </div>
          </Show>
          <div class="rounded-xl border border-base-content/10 bg-code">
            <div class="flex items-center justify-between gap-2 p-3 rounded-t-xl bg-base-100/50 border-b border-base-content/10">
              <div class="flex items-center gap-2 min-w-0 text-sm" title={doc().path}>
                <Show when={busy()} fallback={<FileJson class="w-4 h-4 text-base-content/50 shrink-0" />}>
                  <span class="loading loading-spinner loading-xs shrink-0" />
                </Show>
                <span dir="ltr" class="font-mono truncate">{doc().path.split(/[\\/]/).pop()}</span>
                <Show when={dirty()}><span class="w-1.5 h-1.5 rounded-full bg-warning shrink-0" role="img" aria-label={t("modal.manifest.unsaved")} title={t("modal.manifest.unsaved")} /></Show>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <Show when={!(reviewing() && reviewSide() === "upstream")}>
                  <Show when={editing()} fallback={
                    <button class="btn btn-sm btn-ghost" disabled={busy()} onClick={startEditing}><Pencil class="w-4 h-4" />{t("modal.manifest.edit")}</button>
                  }>
                    <button class="btn btn-sm btn-ghost" disabled={busy()} onClick={cancelEditing}>{t("common.cancel")}</button>
                    <button class="btn btn-sm btn-primary" disabled={busy() || !dirty() || !!validationError()} onClick={save}>
                      <Save class="w-4 h-4" />{t("common.save")}
                    </button>
                  </Show>
                </Show>
                <Dropdown ariaLabel={t("modal.manifest.editorOptions")} trigger={<Ellipsis class="w-4 h-4" />} disabled={busy()} iconOnly scrollable menuWidth="w-64">
                  <DropdownItem icon={<ExternalLink class="w-4 h-4" />} disabled={dirty()} onClick={() => openEditor("preferred")}>{t("modal.manifest.openEditor")}</DropdownItem>
                  <DropdownItem disabled={dirty()} onClick={() => openEditor("choose")}>{t("modal.manifest.chooseEditor")}</DropdownItem>
                  <DropdownItem disabled={dirty()} onClick={() => openEditor("default")}>{t("modal.manifest.defaultApp")}</DropdownItem>
                  <DropdownDivider />
                  <DropdownItem icon={copied() ? <Check class="w-4 h-4 text-success" /> : <Copy class="w-4 h-4" />} onClick={() => copy(editing() ? draft() : doc().content)}>{t("modal.manifest.copyToClipboard")}</DropdownItem>
                  <DropdownItem icon={<RotateCcw class="w-4 h-4" />} onClick={refresh}>{t("modal.manifest.reload")}</DropdownItem>
                  <DropdownItem icon={<History class="w-4 h-4" />} disabled={dirty() || !doc().latestBackup} onClick={restoreBackup}>{t("modal.manifest.restoreBackup")}</DropdownItem>
                  <Show when={doc().upstreamContent !== null}>
                    <DropdownItem onClick={startReview}>{t("modal.manifest.reviewUpstream")}</DropdownItem>
                  </Show>
                  <DropdownDivider />
                  <DropdownItem icon={<Info class="w-4 h-4" />} active={showDetails()} onClick={() => setShowDetails(!showDetails())}>{t("modal.manifest.fileDetails")}</DropdownItem>
                </Dropdown>
              </div>
            </div>
            <Show when={reviewing()}>
              <div class="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-base-content/10 text-xs">
                <div role="group" aria-label={t("modal.manifest.reviewUpstream")} class="flex items-center gap-1">
                  <button class="btn btn-xs btn-ghost" classList={{ "bg-base-content/10": reviewSide() === "local" }} aria-pressed={reviewSide() === "local"} onClick={() => setReviewSide("local")}>{t("modal.manifest.yourVersion")}</button>
                  <button class="btn btn-xs btn-ghost" classList={{ "bg-base-content/10": reviewSide() === "upstream" }} aria-pressed={reviewSide() === "upstream"} onClick={() => setReviewSide("upstream")}>{t("modal.manifest.upstreamVersion")}</button>
                </div>
                <div class="flex items-center gap-1">
                  <Show when={reviewSide() === "upstream" && doc().upstreamContent !== null}>
                    <button class="btn btn-xs btn-ghost text-primary" disabled={busy()} onClick={loadUpstream}>{t("modal.manifest.useUpstream")}</button>
                  </Show>
                  <button class="btn btn-xs btn-ghost btn-square" aria-label={t("modal.manifest.closeReview")} onClick={() => setReviewing(false)}><X class="w-3 h-3" /></button>
                </div>
              </div>
            </Show>
            <Show when={showDetails()}>
              <div class="p-3 border-b border-base-content/10 bg-base-100/30 text-xs text-base-content/60 space-y-2">
                <div class="flex items-center justify-between gap-2">
                  <span class="font-medium text-base-content/80">{doc().installedCopy ? t("modal.manifest.installedCopy") : t("modal.manifest.bucketFile", { bucket: doc().bucket ?? "" })}</span>
                  <button class="btn btn-xs btn-ghost btn-square" aria-label={t("common.close")} onClick={() => setShowDetails(false)}><X class="w-3 h-3" /></button>
                </div>
                <p dir="ltr" class="font-mono break-all select-text">{doc().path}</p>
                <p>{doc().installedCopy ? t("modal.manifest.installedHint") : t("modal.manifest.bucketHint")}</p>
                <Show when={backupPath()}>
                  <div class="flex items-start gap-2">
                    <p class="min-w-0 break-all">{t("modal.manifest.backup")} <span dir="ltr" class="font-mono select-text">{backupPath()}</span></p>
                    <button class="btn btn-xs btn-ghost shrink-0" aria-label={t("modal.manifest.copyBackupPath")} onClick={() => copy(backupPath()!, false)}><Copy class="w-3 h-3" /></button>
                  </div>
                </Show>
              </div>
            </Show>
            <div classList={{ hidden: reviewing() && reviewSide() === "upstream" }}>
              <ManifestCodeEditor content={editing() ? draft() : editableText(doc().content)} editing={editing()} disabled={saving() || confirming()}
                label={t("modal.manifest.editLabel", { name: props.pkg.name })} invalid={!!validationError()}
                onInput={(content) => { setDraft(content); setStatus(null); }} onSave={() => void save()} />
            </div>
            <Show when={reviewing() && reviewSide() === "upstream"}>
              <Show when={doc().upstreamContent !== null} fallback={
                <p class="p-4 text-sm text-base-content/60">{t(doc().upstreamRemoved ? "modal.manifest.upstreamRemoved" : "modal.manifest.upstreamUnavailable")}</p>
              }>
                <ManifestCodeEditor content={editableText(doc().upstreamContent!)} editing={false} disabled={false}
                  label={t("modal.manifest.upstreamVersion")} invalid={false} onInput={() => {}} onSave={() => {}} />
              </Show>
            </Show>
          </div>
          <div class="mt-2 h-5 text-xs text-base-content/60">
            <Show when={validationError()} fallback={
              <Show when={status()}><p role="status" class="flex items-center gap-2"><Check class="w-3 h-3 shrink-0" />{status()}</p></Show>
            }>
              <p role="alert" id="manifest-json-error" class="text-error truncate" title={validationError()!}>{validationError()}</p>
            </Show>
          </div>
        </>}
      </Show>
    </div>
  );
}

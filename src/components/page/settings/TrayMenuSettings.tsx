import { createSignal, createMemo, onMount, For, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { Pin, PinOff, Eye, EyeOff, Search, RotateCcw, Image as ImageIcon } from "lucide-solid";
import { useI18n } from "../../../i18n";
import settingsStore from "../../../stores/settings";

// --- Types (mirror TrayAppDto in Rust) ---
interface TrayApp {
  name: string;
  displayName: string;
  targetPath: string;
  workingDirectory: string;
  iconDataUrl?: string | null;
}

// --- Deterministic colored swatch for the app icon fallback ---
const SWATCH_COLORS = [
  "oklch(60% 0.17 254)", "oklch(56% 0.15 285)", "oklch(58% 0.16 338)", "oklch(58% 0.18 28)",
  "oklch(63% 0.17 53)", "oklch(70% 0.16 88)", "oklch(68% 0.16 125)", "oklch(66% 0.14 155)",
  "oklch(68% 0.12 190)", "oklch(64% 0.14 215)", "oklch(60% 0.14 235)", "oklch(58% 0.14 270)",
];

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return SWATCH_COLORS[Math.abs(hash) % SWATCH_COLORS.length];
}

function AppIcon(props: { app: TrayApp; size?: number }) {
  const size = () => props.size ?? 26;
  const letter = () => props.app.displayName.charAt(0).toUpperCase();
  return (
    <Show
      when={props.app.iconDataUrl}
      fallback={
        <div
          class="grid place-items-center font-bold flex-shrink-0 select-none"
          style={{
            width: `${size()}px`,
            height: `${size()}px`,
            "border-radius": "6px",
            background: colorFor(props.app.name),
            color: "var(--color-app-swatch-content)",
            "font-size": `${Math.max(10, size() * 0.42)}px`,
            "box-shadow": "inset 0 0 0 1px oklch(100% 0 0 / 0.10)",
          }}
        >
          {letter()}
        </div>
      }
    >
      <img
        src={props.app.iconDataUrl!}
        alt=""
        class="flex-shrink-0"
        style={{
          width: `${size()}px`,
          height: `${size()}px`,
          "border-radius": "4px",
          // Let the browser bilinear-scale — source is typically 32x32 and
          // we display at 16-26px, so smoothing looks better than pixelated.
          "image-rendering": "auto",
        }}
      />
    </Show>
  );
}

// --- Tray preview — mimics a native Windows 10/11 context menu. Colors
// track the app's theme (dark/light) so the preview blends in with the
// surrounding settings UI rather than clashing with it. ---
interface PreviewPalette {
  chromeBg: string;
  menuBg: string;
  menuBorder: string;
  menuShadow: string;
  text: string;
  textMuted: string;
  sep: string;
  pinGlyph: string;
  overlay: string;
}

const LIGHT_PALETTE: PreviewPalette = {
  chromeBg: "var(--color-tray-preview-chrome)",
  menuBg: "var(--color-tray-preview-menu)",
  menuBorder: "var(--color-tray-preview-border)",
  menuShadow: "var(--shadow-tray-preview-menu)",
  text: "var(--color-tray-preview-text)",
  textMuted: "var(--color-tray-preview-muted)",
  sep: "var(--color-tray-preview-separator)",
  pinGlyph: "var(--color-tray-preview-pin)",
  overlay: "var(--color-tray-preview-overlay)",
};

const DARK_PALETTE: PreviewPalette = {
  chromeBg: "var(--color-tray-preview-chrome)",
  menuBg: "var(--color-tray-preview-menu)",
  menuBorder: "var(--color-tray-preview-border)",
  menuShadow: "var(--shadow-tray-preview-menu)",
  text: "var(--color-tray-preview-text)",
  textMuted: "var(--color-tray-preview-muted)",
  sep: "var(--color-tray-preview-separator)",
  pinGlyph: "var(--color-tray-preview-pin)",
  overlay: "var(--color-tray-preview-overlay)",
};

function TrayPreview(props: {
  apps: TrayApp[];
  pinned: Set<string>;
  hidden: Set<string>;
}) {
  const { settings } = settingsStore;
  const palette = createMemo<PreviewPalette>(() =>
    settings.theme === "dark" ? DARK_PALETTE : LIGHT_PALETTE,
  );
  const pinnedApps = createMemo(() =>
    props.apps
      .filter(a => props.pinned.has(a.name) && !props.hidden.has(a.name))
      .sort((a, b) => a.displayName.localeCompare(b.displayName)),
  );
  const visibleApps = createMemo(() =>
    props.apps
      .filter(a => !props.pinned.has(a.name) && !props.hidden.has(a.name))
      .sort((a, b) => a.displayName.localeCompare(b.displayName)),
  );
  const pinnedAndHidden = createMemo(() =>
    props.apps.filter(a => props.pinned.has(a.name) && props.hidden.has(a.name)).length,
  );
  const hasAnyApps = createMemo(() => pinnedApps().length + visibleApps().length > 0);

  // Shared row renderer — matches the flat Win10/11 aesthetic.
  const Row = (p: { children: any; muted?: boolean }) => (
    <div
      class="flex items-center gap-2 whitespace-nowrap"
      style={{
        padding: "4px 12px 4px 8px",
        "min-height": "24px",
        color: p.muted ? palette().textMuted : palette().text,
        "font-size": "12px",
      }}
    >
      {p.children}
    </div>
  );

  const Sep = () => (
    <div style={{ height: "1px", background: palette().sep, margin: "3px 0" }} />
  );

  const SectionHeader = (p: { label: string }) => (
    <div
      style={{
        padding: "6px 12px 4px 12px",
        "font-size": "11px",
        color: palette().textMuted,
        "font-weight": 400,
      }}
    >
      {p.label}
    </div>
  );

  return (
    <div
      class="relative p-3 sm:p-5 flex justify-center h-full min-h-[320px] sm:min-h-[380px]"
      style={{
        background: palette().chromeBg,
        "font-family": "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div
        class="overflow-y-auto"
        style={{
          width: "min(230px, 100%)",
          "min-width": "min(190px, 100%)",
          background: palette().menuBg,
          border: `1px solid ${palette().menuBorder}`,
          "border-radius": "4px",
          "box-shadow": palette().menuShadow,
          padding: "4px 0",
          "max-height": "min(460px, calc(100vh - 340px))",
        }}
      >
        <Row>
          <span class="flex-1">Show Rscoop</span>
        </Row>
        <Row>
          <span class="flex-1">Hide Rscoop</span>
        </Row>

        <Show when={hasAnyApps()}>
          <Sep />
          <SectionHeader label="Scoop Apps" />
          <For each={pinnedApps()}>
            {a => (
              <Row>
                <AppIcon app={a} size={16} />
                <span class="flex-1 truncate">{a.displayName}</span>
                <Pin class="w-2.5 h-2.5 flex-shrink-0" style={{ color: palette().pinGlyph }} />
              </Row>
            )}
          </For>
          <Show when={pinnedApps().length > 0 && visibleApps().length > 0}>
            <Sep />
          </Show>
          <For each={visibleApps()}>
            {a => (
              <Row>
                <AppIcon app={a} size={16} />
                <span class="flex-1 truncate">{a.displayName}</span>
              </Row>
            )}
          </For>
        </Show>

        <Sep />
        <Row>
          <span class="flex-1">Edit Tray Menu…</span>
        </Row>
        <Row>
          <span class="flex-1">Refresh Apps</span>
        </Row>
        <Sep />
        <Row>
          <span class="flex-1">Quit</span>
        </Row>
      </div>

      <Show when={pinnedAndHidden() > 0}>
        <div
          class="absolute top-2 left-3 font-mono"
          style={{ "font-size": "10.5px", color: palette().overlay }}
        >
          {pinnedAndHidden()} pinned+hidden suppressed
        </div>
      </Show>
    </div>
  );
}

// --- Main settings component ---
export default function TrayMenuSettings() {
  const { t } = useI18n();
  const [apps, setApps] = createSignal<TrayApp[]>([]);
  const [pinned, setPinned] = createSignal(new Set<string>());
  const [hidden, setHidden] = createSignal(new Set<string>());
  const [query, setQuery] = createSignal("");
  const [loading, setLoading] = createSignal(true);

  // --- Load ---
  onMount(async () => {
    try {
      const [appList, pinnedList, hiddenList] = await Promise.all([
        invoke<TrayApp[]>("get_tray_apps"),
        invoke<string[] | null>("get_config_value", { key: "tray.pinnedApps" }),
        invoke<string[] | null>("get_config_value", { key: "tray.hiddenApps" }),
      ]);
      setApps(appList);
      setPinned(new Set(pinnedList ?? []));
      setHidden(new Set(hiddenList ?? []));
    } catch (e) {
      console.error("Failed to load tray apps/prefs:", e);
    } finally {
      setLoading(false);
    }
  });

  // --- Persistence + live tray refresh ---
  async function persist(key: "tray.pinnedApps" | "tray.hiddenApps", set: Set<string>) {
    try {
      await invoke("set_config_value", { key, value: [...set] });
      await invoke("refresh_tray_apps_menu");
    } catch (e) {
      console.error(`Failed to save ${key}:`, e);
    }
  }

  function togglePin(name: string) {
    setPinned(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      persist("tray.pinnedApps", next);
      return next;
    });
  }

  function toggleHide(name: string) {
    setHidden(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      persist("tray.hiddenApps", next);
      return next;
    });
  }

  function reset() {
    setPinned(new Set<string>());
    setHidden(new Set<string>());
    persist("tray.pinnedApps", new Set<string>());
    persist("tray.hiddenApps", new Set<string>());
  }

  // --- Filter + sort ---
  const filtered = createMemo(() => {
    const q = query().trim().toLowerCase();
    return apps()
      .filter(a => (q ? a.displayName.toLowerCase().includes(q) : true))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  });

  // --- Counts ---
  const counts = createMemo(() => {
    const all = apps();
    const p = pinned();
    const h = hidden();
    const pinnedCount = all.filter(a => p.has(a.name) && !h.has(a.name)).length;
    const visibleCount = all.filter(a => !p.has(a.name) && !h.has(a.name)).length;
    const hiddenCount = all.filter(a => h.has(a.name)).length;
    const pinnedTotal = all.filter(a => p.has(a.name)).length;
    return {
      total: all.length,
      pinnedCount,
      visibleCount,
      hiddenCount,
      pinnedTotal,
      trayCount: pinnedCount + visibleCount,
    };
  });

  return (
    <div class="space-y-4">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div class="min-w-0">
          <h2 class="text-lg sm:text-xl font-semibold flex items-center gap-2">
            <ImageIcon class="w-5 h-5 text-primary shrink-0" />
            {t("tray.title")}
          </h2>
          <p class="text-sm text-base-content/60">{t("tray.description")}</p>
        </div>
        <p class="text-xs text-base-content/60">
          {t("tray.summary.showing", {
            count: String(counts().trayCount),
            total: String(counts().total),
          })}
        </p>
      </div>

      {/* Split layout: list and preview. Stacks below md so narrow windows stay usable. */}
      <div class="grid gap-4 grid-cols-1 md:grid-cols-[minmax(0,1fr)_320px]">
        {/* ===== LEFT: list ===== */}
        <div class="card bg-base-300 shadow-xl overflow-hidden">
          <div class="p-4 border-b border-base-content/10">
            <div class="flex gap-2 items-center flex-wrap">
              <label class="input input-bordered flex items-center gap-2 min-w-[200px] basis-full focus-within:outline-none focus-within:border-base-content/20 sm:basis-auto sm:flex-1">
                <Search class="w-4 h-4 text-base-content/50 flex-shrink-0" />
                <input
                  type="text"
                  class="grow min-w-0"
                  placeholder={t("tray.searchPlaceholder")}
                  value={query()}
                  onInput={e => setQuery(e.currentTarget.value)}
                />
              </label>
              <button
                class="btn btn-sm btn-ghost"
                onClick={reset}
                disabled={pinned().size === 0 && hidden().size === 0}
              >
                <RotateCcw class="w-4 h-4" />
                {t("tray.reset")}
              </button>
            </div>
          </div>

          {/* List */}
          <div class="overflow-y-auto" style={{ "max-height": "min(520px, calc(100vh - 300px))" }}>
            <Show when={!loading()} fallback={
              <div class="p-10 text-center text-base-content/50 text-sm">
                {t("tray.loading")}
              </div>
            }>
              <Show when={filtered().length > 0} fallback={<EmptyState query={query()} />}>
                <For each={filtered()}>
                  {app => {
                    const isPinned = () => pinned().has(app.name);
                    const isHidden = () => hidden().has(app.name);
                    const conflict = () => isPinned() && isHidden();
                    return (
                      <div
                        class="flex items-center gap-3.5 p-2.5 px-4 border-b border-base-content/5"
                        style={{ "min-height": "52px" }}
                        classList={{ "opacity-55": isHidden() }}
                      >
                        <AppIcon app={app} />
                        <div class="flex-1 min-w-0">
                          <div
                            class="text-sm font-medium truncate"
                            classList={{ "line-through decoration-base-content/30": isHidden() }}
                          >
                            {app.displayName}
                          </div>
                        </div>

                        <Show when={conflict()}>
                          <span class="badge badge-sm badge-error badge-outline">
                            {t("tray.conflictBadge")}
                          </span>
                        </Show>

                        <div class="flex gap-0.5">
                          <button
                            class="btn btn-square btn-sm btn-ghost"
                            classList={{ "text-warning bg-warning/15": isPinned() }}
                            onClick={() => togglePin(app.name)}
                            title={isPinned() ? t("tray.action.unpin") : t("tray.action.pin")}
                            aria-label={isPinned() ? t("tray.action.unpin") : t("tray.action.pin")}
                          >
                            <Show when={isPinned()} fallback={<PinOff class="w-4 h-4" />}>
                              <Pin class="w-4 h-4" />
                            </Show>
                          </button>
                          <button
                            class="btn btn-square btn-sm btn-ghost"
                            classList={{ "text-base-content/70 bg-base-content/10": isHidden() }}
                            onClick={() => toggleHide(app.name)}
                            title={isHidden() ? t("tray.action.show") : t("tray.action.hide")}
                            aria-label={isHidden() ? t("tray.action.show") : t("tray.action.hide")}
                          >
                            <Show when={isHidden()} fallback={<Eye class="w-4 h-4" />}>
                              <EyeOff class="w-4 h-4" />
                            </Show>
                          </button>
                        </div>
                      </div>
                    );
                  }}
                </For>
              </Show>
            </Show>
          </div>
        </div>

        {/* ===== RIGHT: preview (sticky only when side-by-side on md+) ===== */}
        <div class="md:sticky md:top-0 h-full">
          <div class="card bg-base-300 shadow-xl overflow-hidden h-full flex flex-col">
            <div class="p-3 px-4 border-b border-base-content/10 flex items-center gap-2">
              <ImageIcon class="w-4 h-4 text-primary" />
              <h3 class="font-semibold text-sm">{t("tray.preview.title")}</h3>
            </div>
            <div class="flex-1 min-h-0">
              <TrayPreview apps={apps()} pinned={pinned()} hidden={hidden()} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState(props: { query: string }) {
  const { t } = useI18n();
  const msg = () => {
    if (props.query) return t("tray.empty.searchMsg", { query: props.query });
    return t("tray.empty.genericMsg");
  };
  const sub = () => {
    if (props.query) return t("tray.empty.searchSub");
    return t("tray.empty.genericSub");
  };
  return (
    <div class="p-11 text-center text-base-content/60">
      <div class="text-sm font-medium">{msg()}</div>
      <div class="text-xs mt-1.5 text-base-content/50">{sub()}</div>
    </div>
  );
}

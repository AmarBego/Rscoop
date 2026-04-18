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

type FilterState = "all" | "pinned" | "visible" | "hidden";

// --- Deterministic colored swatch for the app icon fallback ---
const SWATCH_COLORS = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#f43f5e", "#f97316",
  "#f59e0b", "#eab308", "#84cc16", "#22c55e", "#10b981",
  "#14b8a6", "#06b6d4", "#0ea5e9", "#6366f1",
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
          class="grid place-items-center text-white font-bold flex-shrink-0 select-none"
          style={{
            width: `${size()}px`,
            height: `${size()}px`,
            "border-radius": "6px",
            background: colorFor(props.app.name),
            "font-size": `${Math.max(10, size() * 0.42)}px`,
            "box-shadow": "inset 0 0 0 1px rgba(255,255,255,0.08)",
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
  chromeBg: "#f4f5f7",
  menuBg: "#fbfbfb",
  menuBorder: "#d0d0d0",
  menuShadow: "0 4px 12px rgba(0,0,0,0.12)",
  text: "#1f1f1f",
  textMuted: "#6c6c6c",
  sep: "#e5e5e5",
  pinGlyph: "#b0851f",
  overlay: "#6c6c6c",
};

const DARK_PALETTE: PreviewPalette = {
  chromeBg:
    "radial-gradient(ellipse at 30% 20%, rgba(59,130,246,0.10), transparent 60%), radial-gradient(ellipse at 80% 90%, rgba(59,130,246,0.04), transparent 55%), linear-gradient(180deg, #0a0d14, #070a10)",
  menuBg: "#2c2c2c",
  menuBorder: "#3a3a3a",
  menuShadow: "0 4px 14px rgba(0,0,0,0.55)",
  text: "#e8e8e8",
  textMuted: "#9a9a9a",
  sep: "#3a3a3a",
  pinGlyph: "#f5a524",
  overlay: "rgba(255,255,255,0.45)",
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
      class="relative p-5 flex justify-center"
      style={{
        background: palette().chromeBg,
        "min-height": "380px",
        "font-family": "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div
        class="overflow-y-auto"
        style={{
          "min-width": "220px",
          "max-width": "280px",
          background: palette().menuBg,
          border: `1px solid ${palette().menuBorder}`,
          "border-radius": "4px",
          "box-shadow": palette().menuShadow,
          padding: "4px 0",
          "max-height": "460px",
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
  const [filterState, setFilterState] = createSignal<FilterState>("all");
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

  function hideAll() {
    const next = new Set(apps().map(a => a.name));
    setHidden(next);
    persist("tray.hiddenApps", next);
  }

  function unhideAll() {
    setHidden(new Set<string>());
    persist("tray.hiddenApps", new Set<string>());
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
    const state = filterState();
    const p = pinned();
    const h = hidden();
    return apps()
      .filter(a => (q ? a.displayName.toLowerCase().includes(q) : true))
      .filter(a => {
        if (state === "all") return true;
        if (state === "pinned") return p.has(a.name);
        if (state === "hidden") return h.has(a.name);
        if (state === "visible") return !p.has(a.name) && !h.has(a.name);
        return true;
      })
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

  const FILTER_PILLS: { key: FilterState; label: () => string }[] = [
    { key: "all", label: () => t("tray.filter.all", { count: String(counts().total) }) },
    { key: "pinned", label: () => t("tray.filter.pinned", { count: String(counts().pinnedTotal) }) },
    { key: "visible", label: () => t("tray.filter.visible", { count: String(counts().visibleCount) }) },
    { key: "hidden", label: () => t("tray.filter.hidden", { count: String(counts().hiddenCount) }) },
  ];

  return (
    <div class="space-y-4">
      {/* Intro card with counts */}
      <div class="card bg-base-300 shadow-xl">
        <div class="card-body p-4">
          <h2 class="card-title text-xl flex items-center">
            <ImageIcon class="w-6 h-6 mr-2 text-primary" />
            {t("tray.title")}
          </h2>
          <p class="text-base-content/70 text-sm mb-3">{t("tray.description")}</p>
          <div class="flex gap-2 flex-wrap items-center">
            <span class="badge badge-warning badge-outline gap-1">
              <Pin class="w-3 h-3" />
              {t("tray.summary.pinned", { count: String(counts().pinnedCount) })}
            </span>
            <span class="badge badge-primary badge-outline gap-1">
              <Eye class="w-3 h-3" />
              {t("tray.summary.visible", { count: String(counts().visibleCount) })}
            </span>
            <span class="badge badge-ghost gap-1">
              <EyeOff class="w-3 h-3" />
              {t("tray.summary.hidden", { count: String(counts().hiddenCount) })}
            </span>
            <div class="flex-1" />
            <span class="text-xs text-base-content/60">
              {t("tray.summary.showing", {
                count: String(counts().trayCount),
                total: String(counts().total),
              })}
            </span>
          </div>
        </div>
      </div>

      {/* Split layout: list | preview. Stacks vertically below lg (1024px)
          so the preview + toolbar don't crush each other at 800px windows. */}
      <div class="grid gap-4 grid-cols-1 lg:grid-cols-[1fr_380px]">
        {/* ===== LEFT: list ===== */}
        <div class="card bg-base-300 shadow-xl overflow-hidden">
          {/* Toolbar — wraps at narrow widths: search takes full width,
              action buttons drop to a second row. */}
          <div class="p-4 border-b border-base-content/10">
            <div class="flex gap-2 items-center flex-wrap">
              <label class="input input-bordered flex items-center gap-2 input-sm min-w-[200px] basis-full sm:basis-auto sm:flex-1">
                <Search class="w-4 h-4 text-base-content/50 flex-shrink-0" />
                <input
                  type="text"
                  class="grow min-w-0"
                  placeholder={t("tray.searchPlaceholder")}
                  value={query()}
                  onInput={e => setQuery(e.currentTarget.value)}
                />
              </label>
              <button class="btn btn-sm" onClick={unhideAll} disabled={counts().hiddenCount === 0}>
                <Eye class="w-4 h-4" />
                {t("tray.unhideAll")}
              </button>
              <button class="btn btn-sm" onClick={hideAll}>
                <EyeOff class="w-4 h-4" />
                {t("tray.hideAll")}
              </button>
              <button
                class="btn btn-sm btn-ghost"
                onClick={reset}
                disabled={pinned().size === 0 && hidden().size === 0}
              >
                <RotateCcw class="w-4 h-4" />
                {t("tray.reset")}
              </button>
            </div>
            {/* Filter pills */}
            <div class="flex gap-1.5 mt-3 flex-wrap">
              <For each={FILTER_PILLS}>
                {pill => (
                  <button
                    class="badge badge-sm cursor-pointer"
                    classList={{
                      "badge-primary": filterState() === pill.key,
                      "badge-outline": filterState() !== pill.key,
                    }}
                    onClick={() => setFilterState(pill.key)}
                  >
                    {pill.label()}
                  </button>
                )}
              </For>
            </div>
          </div>

          {/* List */}
          <div class="overflow-y-auto" style={{ "max-height": "520px" }}>
            <Show when={!loading()} fallback={
              <div class="p-10 text-center text-base-content/50 text-sm">
                {t("tray.loading")}
              </div>
            }>
              <Show when={filtered().length > 0} fallback={<EmptyState query={query()} filterState={filterState()} />}>
                <For each={filtered()}>
                  {app => {
                    const isPinned = () => pinned().has(app.name);
                    const isHidden = () => hidden().has(app.name);
                    const conflict = () => isPinned() && isHidden();
                    return (
                      <div
                        class="flex items-center gap-3.5 p-2.5 px-4 border-b border-base-content/5"
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

        {/* ===== RIGHT: preview (sticky only when side-by-side on lg+) ===== */}
        <div class="lg:sticky lg:top-0 lg:self-start">
          <div class="card bg-base-300 shadow-xl overflow-hidden">
            <div class="p-3 px-4 border-b border-base-content/10 flex items-center gap-2">
              <ImageIcon class="w-4 h-4 text-primary" />
              <h3 class="font-semibold text-sm">{t("tray.preview.title")}</h3>
              <div class="flex-1" />
              <span class="badge badge-xs badge-success">{t("tray.preview.live")}</span>
            </div>
            <TrayPreview apps={apps()} pinned={pinned()} hidden={hidden()} />
            <div class="p-2.5 px-4 text-xs text-base-content/50 border-t border-base-content/10">
              {t("tray.preview.hint")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState(props: { query: string; filterState: FilterState }) {
  const { t } = useI18n();
  const msg = () => {
    if (props.query) return t("tray.empty.searchMsg", { query: props.query });
    if (props.filterState === "hidden") return t("tray.empty.hiddenMsg");
    if (props.filterState === "pinned") return t("tray.empty.pinnedMsg");
    return t("tray.empty.genericMsg");
  };
  const sub = () => {
    if (props.query) return t("tray.empty.searchSub");
    if (props.filterState === "hidden") return t("tray.empty.hiddenSub");
    if (props.filterState === "pinned") return t("tray.empty.pinnedSub");
    return t("tray.empty.genericSub");
  };
  return (
    <div class="p-11 text-center text-base-content/60">
      <div class="text-sm font-medium">{msg()}</div>
      <div class="text-xs mt-1.5 text-base-content/50">{sub()}</div>
    </div>
  );
}

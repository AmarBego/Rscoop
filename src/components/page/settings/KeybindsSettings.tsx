import { For } from "solid-js";
import { Dynamic } from "solid-js/web";
import { Keyboard, Globe, Compass, Search, MessageSquare, Code } from "lucide-solid";
import Card from "../../common/Card";
import { useI18n } from "../../../i18n";

interface ShortcutRow {
  /** i18n key for the description */
  labelKey: string;
  /** Keys rendered as <kbd> chips, e.g. ["Ctrl", "F"] */
  keys: string[];
}

interface ShortcutGroup {
  titleKey: string;
  icon: typeof Globe;
  rows: ShortcutRow[];
}

const GROUPS: ShortcutGroup[] = [
  {
    titleKey: "keybinds.globalTitle",
    icon: Globe,
    rows: [
      { labelKey: "keybinds.focusSearch", keys: ["Ctrl", "F"] },
      { labelKey: "keybinds.focusSearchAlt", keys: ["Ctrl", "K"] },
      { labelKey: "keybinds.slashFocus", keys: ["/"] },
      { labelKey: "keybinds.openKeybinds", keys: ["?"] },
    ],
  },
  {
    titleKey: "keybinds.navigationTitle",
    icon: Compass,
    rows: [
      { labelKey: "keybinds.goToSearch", keys: ["Alt", "1"] },
      { labelKey: "keybinds.goToBuckets", keys: ["Alt", "2"] },
      { labelKey: "keybinds.goToInstalled", keys: ["Alt", "3"] },
      { labelKey: "keybinds.goToDoctor", keys: ["Alt", "4"] },
      { labelKey: "keybinds.goToSettings", keys: ["Alt", "5"] },
    ],
  },
  {
    titleKey: "keybinds.searchTitle",
    icon: Search,
    rows: [
      { labelKey: "keybinds.clearSearch", keys: ["Esc"] },
    ],
  },
  {
    titleKey: "keybinds.dialogsTitle",
    icon: MessageSquare,
    rows: [
      { labelKey: "keybinds.closeDialog", keys: ["Esc"] },
      { labelKey: "keybinds.trapFocus", keys: ["Tab"] },
      { labelKey: "keybinds.trapFocusBack", keys: ["Shift", "Tab"] },
    ],
  },
  {
    titleKey: "keybinds.editorTitle",
    icon: Code,
    rows: [
      { labelKey: "keybinds.saveManifest", keys: ["Ctrl", "S"] },
    ],
  },
];

function KeybindsSettings() {
  const { t } = useI18n();

  return (
    <Card
      title={t("keybinds.title")}
      icon={Keyboard}
      description={t("keybinds.description")}
    >
      <div class="flex flex-col gap-6">
        <For each={GROUPS}>
          {(group) => (
            <section>
              <h3 class="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-base-content/60 mb-2">
                <Dynamic component={group.icon} class="w-4 h-4" aria-hidden="true" />
                {t(group.titleKey)}
              </h3>
              <ul class="divide-y divide-base-content/10 rounded-lg border border-base-content/10 px-4">
                <For each={group.rows}>
                  {(row) => (
                    <li class="flex items-center justify-between gap-4 py-2.5">
                      <span class="text-sm min-w-0">{t(row.labelKey)}</span>
                      <span class="flex items-center gap-1 shrink-0" aria-hidden="true">
                        <For each={row.keys}>
                          {(key, i) => (
                            <>
                              {i() > 0 && <span class="text-xs text-base-content/50">+</span>}
                              <kbd class="kbd kbd-sm">{key}</kbd>
                            </>
                          )}
                        </For>
                      </span>
                    </li>
                  )}
                </For>
              </ul>
            </section>
          )}
        </For>
      </div>
    </Card>
  );
}

export default KeybindsSettings;

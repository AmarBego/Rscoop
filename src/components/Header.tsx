import { Component, For, createSignal } from "solid-js";
import { View } from "../types/scoop.ts";
import { Package, Search, Settings, Stethoscope, FolderOpen } from "lucide-solid";
import installedPackagesStore from '../stores/installedPackagesStore';
import { useI18n } from "../i18n";

interface HeaderProps {
  currentView: View;
  onNavigate: (view: View) => void;
}

const Header: Component<HeaderProps> = (props) => {
  const { t } = useI18n();
  const [hasPrefetchedInstalled, setHasPrefetchedInstalled] = createSignal(false);
  const navItems: { view: View; labelKey: string; icon: typeof Search }[] = [
    { view: "search", labelKey: "header.search", icon: Search },
    { view: "bucket", labelKey: "header.buckets", icon: FolderOpen },
    { view: "installed", labelKey: "header.installed", icon: Package },
    { view: "doctor", labelKey: "header.doctor", icon: Stethoscope },
    { view: "settings", labelKey: "header.settings", icon: Settings },
  ];

  const prefetchInstalled = () => {
    if (hasPrefetchedInstalled()) return;
    setHasPrefetchedInstalled(true);
    installedPackagesStore.fetch().catch(() => {
      setHasPrefetchedInstalled(false);
    });
  };

  return (
    <header class="navbar min-h-16 bg-base-400 border-b border-base-300 shadow-sm">
      <div class="flex-1 min-w-0">
        <span class="px-3 text-xl font-bold truncate">{t("app.name")}</span>
      </div>
      <nav class="flex-none overflow-x-auto" aria-label={t("header.navigation")}>
        <ul class="menu menu-horizontal px-1 gap-1 flex-nowrap">
          <For each={navItems}>
            {(item) => (
              <li>
                <button
                  type="button"
                  class="btn btn-ghost min-h-11 h-11 min-w-11 px-3 transition-colors duration-200"
                  classList={{
                    "bg-base-300 text-info font-semibold": props.currentView === item.view,
                    "hover:bg-base-300/50": props.currentView !== item.view,
                  }}
                  aria-current={props.currentView === item.view ? "page" : undefined}
                  aria-label={t(item.labelKey)}
                  title={t(item.labelKey)}
                  onClick={() => props.onNavigate(item.view)}
                  onMouseEnter={() => {
                    if (item.view === 'installed') {
                      prefetchInstalled();
                    }
                  }}
                  onFocus={() => {
                    if (item.view === 'installed') {
                      prefetchInstalled();
                    }
                  }}
                >
                  <item.icon class="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span class="hidden sm:inline whitespace-nowrap">{t(item.labelKey)}</span>
                </button>
              </li>
            )}
          </For>
        </ul>
      </nav>
    </header>
  );
};

export default Header; 

import { Component, For } from "solid-js";
import { View } from "../types/scoop.ts";
import { Package, Search, Settings, Stethoscope, FolderOpen } from "lucide-solid";
import installedPackagesStore from '../stores/installedPackagesStore';

interface HeaderProps {
  currentView: View;
  onNavigate: (view: View) => void;
}

const Header: Component<HeaderProps> = (props) => {
  const navItems: { view: View; label: string; icon: typeof Search }[] = [
    { view: "search", label: "Search", icon: Search },
    { view: "bucket", label: "Buckets", icon: FolderOpen },
    { view: "installed", label: "Installed", icon: Package },
    { view: "doctor", label: "Doctor", icon: Stethoscope },
    { view: "settings", label: "Settings", icon: Settings },
  ];

  const toggleCommandPalette = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      // The command palette component handles its own visibility
    }
  };

  document.addEventListener("keydown", toggleCommandPalette);

  return (
    <div class="navbar bg-base-400 border-b border-base-300 shadow-sm">
      <div class="flex-1">
        <a class="btn btn-ghost text-xl font-bold">Rscoop</a>
      </div>
      <div class="flex-none">
        <ul class="menu menu-horizontal px-1 gap-1">
          <For each={navItems}>
            {(item) => (
              <li>
                <button
                  class="btn btn-sm btn-ghost transition-colors duration-200"
                  classList={{
                    "bg-base-300 text-info font-semibold": props.currentView === item.view,
                    "hover:bg-base-300/50": props.currentView !== item.view,
                  }}
                  onClick={() => props.onNavigate(item.view)}
                  onMouseEnter={() => {
                    if (item.view === 'installed') {
                      installedPackagesStore.fetch();
                    }
                  }}
                >
                  <item.icon class="w-4 h-4" />
                  {item.label}
                </button>
              </li>
            )}
          </For>
        </ul>
      </div>
    </div>
  );
};

export default Header; 
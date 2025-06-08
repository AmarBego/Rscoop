import { Component, For } from "solid-js";
import { View } from "../types/scoop.ts";
import { Package, Search, Settings } from "lucide-solid";

interface HeaderProps {
  currentView: View;
  onNavigate: (view: View) => void;
}

const Header: Component<HeaderProps> = (props) => {
  const navItems: { view: View; label: string; icon: typeof Search }[] = [
    { view: "search", label: "Search", icon: Search },
    { view: "installed", label: "Installed", icon: Package },
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
    <div class="navbar bg-base-200">
      <div class="flex-1">
        <a class="btn btn-ghost text-xl">Rscoop</a>
      </div>
      <div class="flex-none">
        <ul class="menu menu-horizontal px-1">
          <For each={navItems}>
            {(item) => (
              <li>
                <button
                  class="btn"
                  classList={{
                    "btn-active": props.currentView === item.view,
                  }}
                  onClick={() => props.onNavigate(item.view)}
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
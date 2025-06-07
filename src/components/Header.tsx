import { Component, For } from "solid-js";
import type { View } from "../App";

interface HeaderProps {
  currentView: View;
  onNavigate: (view: View) => void;
}

const Header: Component<HeaderProps> = (props) => {
  const navItems: { view: View; label: string }[] = [
    { view: "search", label: "Search" },
    { view: "installed", label: "Installed" },
    { view: "settings", label: "Settings" },
  ];

  return (
    <header class="bg-gray-100 dark:bg-gray-800/80 backdrop-blur-md shadow-sm sticky top-0 z-40 border-b border-gray-200 dark:border-gray-700">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between items-center h-16">
          <div class="flex-shrink-0 flex items-center gap-2">
            <h1 class="text-xl font-bold text-gray-900 dark:text-white">Rscoop</h1>
          </div>
          <nav class="flex items-center bg-gray-200 dark:bg-gray-700 p-1 rounded-lg">
            <For each={navItems}>
              {(item) => (
                <button
                  class="px-4 py-1.5 rounded-md text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-100 dark:focus-visible:ring-offset-gray-800"
                  classList={{
                    "bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm": props.currentView === item.view,
                    "text-gray-600 dark:text-gray-300 hover:bg-gray-100/50 dark:hover:bg-white/10": props.currentView !== item.view,
                  }}
                  onClick={() => props.onNavigate(item.view)}
                >
                  {item.label}
                </button>
              )}
            </For>
          </nav>
        </div>
      </div>
    </header>
  );
};

export default Header; 
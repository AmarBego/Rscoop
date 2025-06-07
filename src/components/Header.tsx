import { Component, For } from "solid-js";
import type { View } from "../App";
import { ThemeToggle } from "./ui/ThemeToggle";
import { Package, Search, Settings, Command } from "lucide-solid";

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
    <header class="bg-dark-surface/80 backdrop-blur-md shadow-sm sticky top-0 z-40 border-b border-dark-border">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between items-center h-16">
          <div class="flex-shrink-0 flex items-center gap-2">
            <h1 class="text-xl font-bold text-dark-text-primary">Rscoop</h1>
            <span class="bg-primary-500 text-dark-text-primary text-xs font-medium px-2 py-0.5 rounded-full">Beta</span>
          </div>
          <div class="flex items-center gap-4">
            <nav class="flex items-center bg-dark-background/50 p-1 rounded-xl">
              <For each={navItems}>
                {(item) => (
                  <button
                    class="px-4 py-1.5 rounded-xl text-sm font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-dark-background flex items-center gap-2"
                    classList={{
                      "bg-dark-surface shadow-sm text-primary-500": props.currentView === item.view,
                      "text-dark-text-secondary hover:bg-dark-background/80": props.currentView !== item.view,
                    }}
                    onClick={() => props.onNavigate(item.view)}
                  >
                    <item.icon class="w-4 h-4" />
                    {item.label}
                  </button>
                )}
              </For>
            </nav>
            <div class="flex items-center gap-2">
              <button 
                class="inline-flex h-9 items-center justify-center rounded-lg bg-dark-background/50 px-3 py-1 text-sm font-medium text-dark-text-secondary hover:bg-dark-background transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-dark-background"
                onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
              >
                <Command class="w-4 h-4 mr-2" />
                <span>Command</span>
                <kbd class="ml-2 rounded px-1.5 py-0.5 text-xs font-medium bg-dark-surface border border-dark-border">⌘K</kbd>
              </button>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header; 
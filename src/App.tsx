import { createSignal, Show } from "solid-js";
import "./App.css";
import Header from "./components/Header.tsx";
import SearchPage from "./pages/SearchPage.tsx";
import InstalledPage from "./pages/InstalledPage.tsx";
import { ToastProvider } from "./components/ui/Toast";
import { CommandPalette } from "./components/ui/CommandPalette";

export type View = "search" | "installed" | "settings";

function App() {
  const [view, setView] = createSignal<View>("search");

  const commands = [
    {
      id: "search",
      name: "Search Packages",
      description: "Search for packages in scoop",
      shortcut: ["Ctrl", "1"],
      action: () => setView("search"),
    },
    {
      id: "installed",
      name: "View Installed Packages",
      description: "See your installed packages",
      shortcut: ["Ctrl", "2"],
      action: () => setView("installed"),
    },
    {
      id: "settings",
      name: "Open Settings",
      description: "Configure application settings",
      shortcut: ["Ctrl", "3"],
      action: () => setView("settings"),
    },
    {
      id: "refresh",
      name: "Refresh Scoop",
      description: "Update scoop and package lists",
      action: () => console.log("Refreshing scoop..."),
    },
    {
      id: "update-all",
      name: "Update All Packages",
      description: "Update all installed packages",
      action: () => console.log("Updating all packages..."),
    }
  ];

  return (
    <ToastProvider>
      <main class="min-h-screen bg-dark-background text-dark-text-primary font-sans">
        <Header currentView={view()} onNavigate={setView} />
        <CommandPalette commands={commands} />
        <div>
          <Show when={view() === "search"}>
            <SearchPage />
          </Show>
          <Show when={view() === "installed"}>
            <InstalledPage />
          </Show>
          <Show when={view() === "settings"}>
            <div class="p-4 sm:p-6 md:p-8">
              <h2 class="text-3xl font-bold tracking-tight">Settings</h2>
              <div class="mt-6 p-12 rounded-xl shadow-md shadow-black/30 text-center backdrop-blur-sm bg-white/5 border border-dark-border">
                <p class="text-xl text-dark-text-secondary">Settings are not yet implemented.</p>
              </div>
            </div>
          </Show>
        </div>
      </main>
    </ToastProvider>
  );
}

export default App;

import { createSignal, Show } from "solid-js";
import "./App.css";
import Header from "./components/Header.tsx";
import SearchPage from "./pages/SearchPage.tsx";
import InstalledPage from "./pages/InstalledPage.tsx";

export type View = "search" | "installed" | "settings";

function App() {
  const [view, setView] = createSignal<View>("search");

  return (
    <main class="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-50 font-sans">
      <Header currentView={view()} onNavigate={setView} />
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
            <div class="mt-6 p-12 bg-white dark:bg-gray-800 rounded-lg shadow text-center">
              <p class="text-xl text-gray-500 dark:text-gray-400">Settings are not yet implemented.</p>
            </div>
          </div>
        </Show>
      </div>
    </main>
  );
}

export default App;

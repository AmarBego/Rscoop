import { createSignal, Show } from "solid-js";
import "./App.css";
import Header from "./components/Header.tsx";
import SearchPage from "./pages/SearchPage.tsx";
import InstalledPage from "./pages/InstalledPage.tsx";
import { View } from "./types/scoop.ts";

function App() {
  const [view, setView] = createSignal<View>("search");

  return (
    <div class="drawer">
      <input id="my-drawer" type="checkbox" class="drawer-toggle" />
      <div class="drawer-content flex flex-col">
        <Header currentView={view()} onNavigate={setView} />
        <main class="flex-1 p-6">
          <Show when={view() === "search"}>
            <SearchPage />
          </Show>
          <Show when={view() === "installed"}>
            <InstalledPage />
          </Show>
          <Show when={view() === "settings"}>
            <div class="p-4 sm:p-6 md:p-8">
              <h2 class="text-3xl font-bold tracking-tight">Settings</h2>
              <div class="mt-6 p-12 bg-base-200 rounded-lg shadow text-center">
                <p class="text-xl text-base-content/70">Settings are not yet implemented.</p>
              </div>
            </div>
          </Show>
        </main>
      </div>
      <div class="drawer-side">
        <label for="my-drawer" aria-label="close sidebar" class="drawer-overlay"></label>
        <ul class="menu p-4 w-80 min-h-full bg-base-200 text-base-content">
          <li><a>Sidebar Item 1</a></li>
          <li><a>Sidebar Item 2</a></li>
        </ul>
      </div>
    </div>
  );
}

export default App;

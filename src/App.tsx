import { createSignal, Show } from "solid-js";
import "./App.css";
import Header from "./components/Header.tsx";
import SearchPage from "./pages/SearchPage.tsx";
import InstalledPage from "./pages/InstalledPage.tsx";
import { View } from "./types/scoop.ts";
import SettingsPage from "./pages/SettingsPage.tsx";
import DoctorPage from "./pages/DoctorPage.tsx";

function App() {
  const [view, setView] = createSignal<View>("search");

  return (
    <>
      <div class="drawer">
        <input id="my-drawer" type="checkbox" class="drawer-toggle" />
        <div class="drawer-content flex flex-col h-screen">
          <Header currentView={view()} onNavigate={setView} />
          <main class="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto">
            <Show when={view() === "search"}>
              <SearchPage />
            </Show>
            <Show when={view() === "installed"}>
              <InstalledPage />
            </Show>
            <Show when={view() === "settings"}>
              <SettingsPage />
            </Show>
            <Show when={view() === "doctor"}>
              <DoctorPage />
            </Show>
          </main>
        </div>
        <div class="drawer-side">
          <label
            for="my-drawer"
            aria-label="close sidebar"
            class="drawer-overlay"
          ></label>
          <ul class="menu p-4 w-80 min-h-full bg-base-200 text-base-content">
            <li>
              <a>Sidebar Item 1</a>
            </li>
            <li>
              <a>Sidebar Item 2</a>
            </li>
          </ul>
        </div>
      </div>
    </>
  );
}

export default App;

import { createSignal, Show } from "solid-js";
import "./App.css";
import Header from "./components/Header.tsx";
import SearchPage from "./pages/SearchPage.tsx";

export type View = "search" | "installed" | "settings";

function App() {
  const [view, setView] = createSignal<View>("search");

  return (
    <main class="container">
      <Header currentView={view()} onNavigate={setView} />
      <div class="content">
        <Show when={view() === "search"}>
          <SearchPage />
        </Show>
        <Show when={view() === "installed"}>
          <p>Installed packages view (not implemented yet).</p>
        </Show>
        <Show when={view() === "settings"}>
          <p>Settings view (not implemented yet).</p>
        </Show>
      </div>
    </main>
  );
}

export default App;

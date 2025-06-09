import { createSignal, Show, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import Header from "./components/Header.tsx";
import SearchPage from "./pages/SearchPage.tsx";
import InstalledPage from "./pages/InstalledPage.tsx";
import { View } from "./types/scoop.ts";
import SettingsPage from "./pages/SettingsPage.tsx";
import OperationModal from "./components/OperationModal.tsx";
import DoctorPage from "./pages/DoctorPage.tsx";

function App() {
  const [view, setView] = createSignal<View>("search");
  
  // State for the initial dependency check
  type SfsuState = 'checking' | 'installed' | 'missing' | 'installing' | 'failed';
  const [sfsuState, setSfsuState] = createSignal<SfsuState>('checking');
  const [operationTitle, setOperationTitle] = createSignal<string | null>(null);

  onMount(async () => {
    try {
      const isInstalled = await invoke<boolean>('check_sfsu_installed');
      setSfsuState(isInstalled ? 'installed' : 'missing');
    } catch (err) {
      console.error("Failed to check for sfsu:", err);
      setSfsuState('failed'); // Go to failed state if check itself errors
    }
  });
  
  const installSfsu = () => {
    setSfsuState('installing');
    setOperationTitle('Installing sfsu (required dependency)...');
    invoke('install_package', { packageName: 'sfsu', packageSource: '' })
      .catch(err => {
        console.error('sfsu installation failed', err);
        setSfsuState('failed');
      });
  };

  const handleSfsuInstallClose = (wasSuccess: boolean) => {
    setOperationTitle(null);
    if (wasSuccess) {
      // Success! Reload the app to ensure all state is fresh and correct.
      window.location.reload();
    } else {
      setSfsuState('failed');
    }
  };

  return (
    <>
      <Show when={sfsuState() === 'installed'}>
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
            <label for="my-drawer" aria-label="close sidebar" class="drawer-overlay"></label>
            <ul class="menu p-4 w-80 min-h-full bg-base-200 text-base-content">
              <li><a>Sidebar Item 1</a></li>
              <li><a>Sidebar Item 2</a></li>
            </ul>
          </div>
        </div>
      </Show>

      <Show when={sfsuState() === 'checking'}>
          <div class="flex h-screen w-screen items-center justify-center">
              <span class="loading loading-spinner loading-lg"></span>
          </div>
      </Show>

      {/* Using a standard modal for the prompt */}
      <div class="modal modal-open" classList={{ 'modal-open': sfsuState() === 'missing' || sfsuState() === 'failed' }}>
        <div class="modal-box">
          <Show when={sfsuState() === 'missing'} fallback={
            <>
              <h3 class="font-bold text-lg text-error">Installation Failed</h3>
              <p class="py-4">Could not install 'sfsu'. The application cannot continue without it. Please try installing it manually via 'scoop install sfsu' and restart the application.</p>
              <div class="modal-action">
                <button class="btn" onClick={installSfsu}>Try Again</button>
              </div>
            </>
          }>
            <h3 class="font-bold text-lg">Required Dependency Missing</h3>
            <p class="py-4">To use this application, the 'sfsu' package is required. It provides enhanced search and status features for Scoop.</p>
            <div class="modal-action">
              <button class="btn btn-primary" onClick={installSfsu}>Install sfsu</button>
            </div>
          </Show>
        </div>
      </div>
      
      {/* Reusing OperationModal for the installation process itself */}
      <OperationModal 
        title={operationTitle()} 
        onClose={handleSfsuInstallClose} 
      />
    </>
  );
}

export default App;

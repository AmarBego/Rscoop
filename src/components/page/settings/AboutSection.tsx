import { ShieldCheck, Download, RefreshCw } from "lucide-solid";
import { createSignal, onMount, Show } from "solid-js";
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { ask } from '@tauri-apps/plugin-dialog';
import pkgJson from "../../../../package.json";

// Define the types we need
interface UpdateEvent {
  event: 'Started' | 'Progress' | 'Finished';
  data: {
    contentLength?: number;
    chunkLength?: number;
  };
}

export default function AboutSection() {
  const [updateStatus, setUpdateStatus] = createSignal<'idle' | 'checking' | 'available' | 'downloading' | 'installing' | 'error'>('idle');
  const [updateInfo, setUpdateInfo] = createSignal<any>(null);
  const [updateError, setUpdateError] = createSignal<string | null>(null);
  const [downloadProgress, setDownloadProgress] = createSignal<{downloaded: number; total: number | null}>({ downloaded: 0, total: null });
  
  const checkForUpdates = async () => {
    try {
      setUpdateStatus('checking');
      setUpdateError(null);
      
      const update = await check();
      
      if (update?.available) {
        setUpdateStatus('available');
        setUpdateInfo(update);
        
        // Option to automatically prompt the user
        const shouldInstall = await ask(
          `Update to ${update.version} is available!\n\nRelease notes: ${update.body || 'No release notes provided'}`,
          {
            title: "Update Available",
            kind: "info",
            okLabel: "Install Now",
            cancelLabel: "Later"
          }
        );
        
        if (shouldInstall) {
          await installAvailableUpdate();
        }
      } else {
        setUpdateStatus('idle');
        await ask("You're already using the latest version!", {
          title: "No Updates Available",
          kind: "info"
        });
      }
    } catch (error) {
      console.error('Failed to check for updates:', error);
      setUpdateStatus('error');
      setUpdateError(error instanceof Error ? error.message : String(error));
    }
  };

  const installAvailableUpdate = async () => {
    try {
      if (!updateInfo()) {
        throw new Error("No update information available");
      }
      
      setUpdateStatus('downloading');
      setDownloadProgress({ downloaded: 0, total: null });
      
      // Download and install the update with progress reporting
      await updateInfo().downloadAndInstall((event: UpdateEvent) => {
        switch (event.event) {
          case 'Started':
            setDownloadProgress({ 
              downloaded: 0, 
              total: event.data.contentLength || null 
            });
            break;
          case 'Progress':
            setDownloadProgress(prev => ({ 
              downloaded: prev.downloaded + (event.data.chunkLength || 0), 
              total: prev.total 
            }));
            break;
          case 'Finished':
            setUpdateStatus('installing');
            break;
        }
      });
      
      // Restart the app after successful installation
      await ask(
        "Update has been installed successfully. The application needs to restart to apply the changes.",
        {
          title: "Update Complete",
          kind: "info",
          okLabel: "Restart Now"
        }
      );
      
      await relaunch();
    } catch (error) {
      console.error('Failed to install update:', error);
      setUpdateStatus('error');
      setUpdateError(error instanceof Error ? error.message : String(error));
    }
  };

  onMount(() => {
    // Check for updates when the component mounts
    checkForUpdates();
  });

  return (
    <div class="card bg-base-200 shadow-xl">
      <div class="card-body">
        <div class="flex justify-between items-center">
          <h2 class="card-title text-xl">
            <ShieldCheck class="w-6 h-6 mr-2 text-secondary" />
            About
          </h2>
          <span class="badge badge-outline badge-info">v{pkgJson.version}</span>
        </div>
        <p class="text-base-content/60 mt-2">
          A modern, powerful GUI for Scoop on Windows.
        </p>
        
        <div class="flex flex-col space-y-2 mt-4">
          {updateStatus() === 'idle' && (
            <button 
              class="btn btn-sm btn-outline btn-accent w-full"
              onClick={checkForUpdates}
            >
              <RefreshCw class="w-4 h-4 mr-1" />
              Check for updates
            </button>
          )}
          
          {updateStatus() === 'checking' && (
            <button class="btn btn-sm btn-outline w-full" disabled>
              <span class="loading loading-spinner loading-xs mr-1"></span>
              Checking for updates...
            </button>
          )}
          
          {updateStatus() === 'available' && (
            <div class="space-y-2">
              <div class="text-center text-sm text-success font-medium">
                Update available: v{updateInfo()?.version}
              </div>
              <Show when={updateInfo()?.body}>
                <div class="text-xs text-base-content/70 max-h-20 overflow-y-auto p-2 bg-base-300 rounded">
                  {updateInfo()?.body}
                </div>
              </Show>
              <button 
                class="btn btn-sm btn-success w-full"
                onClick={installAvailableUpdate}
              >
                <Download class="w-4 h-4 mr-1" />
                Install update
              </button>
            </div>
          )}
          
          {updateStatus() === 'downloading' && (
            <div class="space-y-2">
              <button class="btn btn-sm btn-outline btn-info w-full" disabled>
                <span class="loading loading-spinner loading-xs mr-1"></span>
                Downloading update...
              </button>
              <progress 
                class="progress progress-info w-full" 
                value={downloadProgress().downloaded} 
                max={downloadProgress().total || 100}
              />
              <div class="text-xs text-center">
                {downloadProgress().total 
                  ? `${Math.round(downloadProgress().downloaded / 1024)} KB of ${Math.round((downloadProgress().total || 0) / 1024)} KB` 
                  : `${Math.round(downloadProgress().downloaded / 1024)} KB downloaded`}
              </div>
            </div>
          )}
          
          {updateStatus() === 'installing' && (
            <button class="btn btn-sm btn-outline btn-success w-full" disabled>
              <span class="loading loading-spinner loading-xs mr-1"></span>
              Installing update...
            </button>
          )}
          
          {updateStatus() === 'error' && (
            <div class="space-y-1">
              <div class="text-error text-center text-xs">{updateError()}</div>
              <button 
                class="btn btn-sm btn-outline btn-error w-full"
                onClick={checkForUpdates}
              >
                <RefreshCw class="w-4 h-4 mr-1" />
                Try again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 
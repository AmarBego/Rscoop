import { Download, RefreshCw, Star, BookOpen } from "lucide-solid";

const GithubIcon = (props: { class?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class={props.class}>
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
  </svg>
);

import { createSignal, Show } from "solid-js";
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { ask, message } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import pkgJson from "../../../../package.json";

// Define the types we need
interface UpdateEvent {
  event: 'Started' | 'Progress' | 'Finished';
  data: {
    contentLength?: number;
    chunkLength?: number;
  };
}

export interface AboutSectionRef {
  checkForUpdates: (manual: boolean) => Promise<void>;
}

export interface AboutSectionProps {
  ref: (ref: AboutSectionRef) => void;
  isScoopInstalled?: boolean;
}

export default function AboutSection(props: AboutSectionProps) {
  const [updateStatus, setUpdateStatus] = createSignal<'idle' | 'checking' | 'available' | 'downloading' | 'installing' | 'error'>('idle');
  const [updateInfo, setUpdateInfo] = createSignal<any>(null);
  const [updateError, setUpdateError] = createSignal<string | null>(null);
  const [downloadProgress, setDownloadProgress] = createSignal<{ downloaded: number; total: number | null }>({ downloaded: 0, total: null });

  const checkForUpdates = async (manual: boolean) => {
    try {
      // Don't check for updates if installed via Scoop
      if (props.isScoopInstalled) {
        if (manual) {
          await message("This app was installed via Scoop. Please use Scoop to update this application instead.", {
            title: "Updates via Scoop",
            kind: "info"
          });
        }
        return;
      }

      setUpdateStatus('checking');
      setUpdateError(null);

      const update = await check();

      if (update?.available) {
        setUpdateStatus('available');
        setUpdateInfo(update);

        // Only show dialog if user manually clicked "Check for updates"
        if (manual) {
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
        }
      } else {
        setUpdateStatus('idle');
        if (manual) {
          await message("You're already using the latest version!", {
            title: "No Updates Available",
            kind: "info"
          });
        }
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

  props.ref({ checkForUpdates });

  return (
    <div class="card bg-base-200 shadow-xl overflow-hidden">
      {/* Hero Section */}
      <div class="bg-base-300 p-8 flex flex-col items-center text-center space-y-4">
        <div>
          <h2 class="text-3xl font-bold tracking-tight">Rscoop</h2>
          <p class="text-base-content/60 font-medium">v{pkgJson.version}</p>
        </div>
        <p class="max-w-md  leading-relaxed">
          A modern, powerful, and fast GUI for Scoop package manager on Windows.
        </p>
      </div>

      <div class="card-body p-6 space-y-8">

        {/* Update Section */}
        <div class="bg-base-100 rounded-xl p-5 border border-base-content/5 shadow-sm">
          <div class="flex items-center justify-between mb-4">
            <div class="font-semibold flex items-center gap-2">
              <RefreshCw class="w-4 h-4 text-base-content/70" />
              Update Status
            </div>
            {props.isScoopInstalled && (
              <span class="badge badge-sm badge-info badge-outline">Managed by Scoop</span>
            )}
          </div>

          {props.isScoopInstalled ? (
            <div class="alert alert-info text-sm shadow-sm">
              <span>Use <code>scoop update rscoop</code> in your terminal to update.</span>
            </div>
          ) : (
            <div class="space-y-4">
              {updateStatus() === 'idle' && (
                <div class="flex items-center justify-between">
                  <span class="text-sm text-base-content/70">Check for the latest version</span>
                  <button
                    class="btn btn-sm btn-primary"
                    onClick={() => checkForUpdates(true)}
                  >
                    Check Now
                  </button>
                </div>
              )}

              {updateStatus() === 'checking' && (
                <div class="flex items-center justify-center py-2 text-base-content/70">
                  <span class="loading loading-spinner loading-sm mr-3"></span>
                  Checking for updates...
                </div>
              )}

              {updateStatus() === 'available' && (
                <div class="space-y-3 animate-in fade-in slide-in-from-top-2">
                  <div class="alert alert-success shadow-sm">
                    <Download class="w-5 h-5" />
                    <div>
                      <h3 class="font-bold">Update Available!</h3>
                      <div class="text-xs">Version {updateInfo()?.version} is ready to install.</div>
                    </div>
                    <button class="btn btn-sm" onClick={installAvailableUpdate}>Install</button>
                  </div>
                  <Show when={updateInfo()?.body}>
                    <div class="bg-base-200 rounded-lg p-3 text-xs max-h-32 overflow-y-auto border border-base-content/5">
                      <div class="font-bold mb-1 opacity-70">Release Notes:</div>
                      <div class="whitespace-pre-wrap opacity-80">{updateInfo()?.body}</div>
                    </div>
                  </Show>
                </div>
              )}

              {updateStatus() === 'downloading' && (
                <div class="space-y-2">
                  <div class="flex justify-between text-xs font-medium">
                    <span>Downloading update...</span>
                    <span>{downloadProgress().total
                      ? `${Math.round((downloadProgress().downloaded / (downloadProgress().total || 1)) * 100)}%`
                      : '...'}</span>
                  </div>
                  <progress
                    class="progress progress-primary w-full"
                    value={downloadProgress().downloaded}
                    max={downloadProgress().total || 100}
                  />
                </div>
              )}

              {updateStatus() === 'installing' && (
                <div class="flex items-center justify-center py-2 text-success font-medium">
                  <span class="loading loading-spinner loading-sm mr-3"></span>
                  Installing update...
                </div>
              )}

              {updateStatus() === 'error' && (
                <div class="alert alert-error shadow-sm">
                  <div class="flex-1">
                    <div class="font-bold text-xs">Update Failed</div>
                    <div class="text-xs opacity-80">{updateError()}</div>
                  </div>
                  <button class="btn btn-xs btn-outline" onClick={() => checkForUpdates(true)}>Retry</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Links */}
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <button
            class="btn btn-outline hover:bg-base-content hover:text-base-100 transition-all"
            onClick={() => openUrl('https://github.com/AmarBego/Rscoop').catch(console.error)}
          >
            <GithubIcon class="w-5 h-5" />
            GitHub
          </button>
          <button
            class="btn btn-outline btn-info hover:text-info-content transition-all"
            onClick={() => openUrl('https://amarbego.github.io/Rscoop/').catch(console.error)}
          >
            <BookOpen class="w-5 h-5" />
            Docs
          </button>
          <button
            class="btn btn-outline btn-warning hover:text-warning-content transition-all"
            onClick={() => openUrl('https://github.com/AmarBego/Rscoop').catch(console.error)}
          >
            <Star class="w-5 h-5" />
            Star Project
          </button>
        </div>

        {/* Footer */}
        <div class="text-center text-xs text-base-content/30 pt-4">
          <p>Copyright © {new Date().getFullYear()} AmarBego. MIT License.</p>
        </div>
      </div>
    </div>
  );
}
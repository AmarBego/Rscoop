import { RefreshCw, Star, BookOpen } from "lucide-solid";

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
import { useI18n } from "../../../i18n";

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
  const { t } = useI18n();
  const [updateStatus, setUpdateStatus] = createSignal<'idle' | 'checking' | 'available' | 'downloading' | 'installing' | 'error'>('idle');
  const [updateInfo, setUpdateInfo] = createSignal<any>(null);
  const [updateError, setUpdateError] = createSignal<string | null>(null);
  const [downloadProgress, setDownloadProgress] = createSignal<{ downloaded: number; total: number | null }>({ downloaded: 0, total: null });

  const checkForUpdates = async (manual: boolean) => {
    try {
      // Don't check for updates if installed via Scoop
      if (props.isScoopInstalled) {
        if (manual) {
          await message(t("about.scoopUpdateMessage"), {
            title: t("about.scoopUpdateTitle"),
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
            t("about.updateDialogText", { version: update.version, notes: update.body || 'No release notes provided' }),
            {
              title: t("about.updateDialogTitle"),
              kind: "info",
              okLabel: t("about.installNow"),
              cancelLabel: t("about.later")
            }
          );

          if (shouldInstall) {
            await installAvailableUpdate();
          }
        }
      } else {
        setUpdateStatus('idle');
        if (manual) {
          await message(t("about.noUpdates"), {
            title: t("about.noUpdatesTitle"),
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
        t("about.updateComplete"),
        {
          title: t("about.updateCompleteTitle"),
          kind: "info",
          okLabel: t("about.restartNow")
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
          <h2 class="text-3xl font-bold tracking-tight">{t("app.name")}</h2>
          <p class="text-base-content/60 font-medium">{t("about.version", { version: pkgJson.version })}</p>
        </div>
        <p class="max-w-md leading-relaxed text-base-content/60">
          {t("app.description")}
        </p>
      </div>

      <div class="card-body p-6 space-y-8">

        {/* Update Section */}
        {props.isScoopInstalled ? (
          <div class="flex items-center justify-center gap-2 text-sm text-base-content/50">
            <span>{t("about.managedByScoop")}</span>
          </div>
        ) : (
          <div>
            {updateStatus() === 'idle' && (
              <div class="flex items-center justify-center">
                <button
                  class="btn btn-sm btn-ghost text-base-content/60"
                  onClick={() => checkForUpdates(true)}
                >
                  <RefreshCw class="w-3.5 h-3.5" />
                  {t("about.checkForUpdates")}
                </button>
              </div>
            )}

            {updateStatus() === 'checking' && (
              <div class="flex items-center justify-center gap-2 text-sm text-base-content/50">
                <span class="loading loading-spinner loading-xs"></span>
                {t("about.checking")}
              </div>
            )}

            {updateStatus() === 'available' && (
              <div class="space-y-2">
                <div class="flex items-center justify-center gap-3">
                  <span class="text-sm text-success">{t("about.versionAvailable", { version: updateInfo()?.version })}</span>
                  <button class="btn btn-xs btn-primary" onClick={installAvailableUpdate}>{t("common.install")}</button>
                </div>
                <Show when={updateInfo()?.body}>
                  <div class="bg-base-100 rounded-lg p-3 text-xs max-h-24 overflow-y-auto">
                    <div class="whitespace-pre-wrap text-base-content/60">{updateInfo()?.body}</div>
                  </div>
                </Show>
              </div>
            )}

            {updateStatus() === 'downloading' && (
              <div class="space-y-1 max-w-xs mx-auto">
                <div class="flex justify-between text-xs text-base-content/50">
                  <span>{t("about.downloading")}</span>
                  <span>{downloadProgress().total
                    ? `${Math.round((downloadProgress().downloaded / (downloadProgress().total || 1)) * 100)}%`
                    : '...'}</span>
                </div>
                <progress
                  class="progress progress-primary w-full h-1"
                  value={downloadProgress().downloaded}
                  max={downloadProgress().total || 100}
                />
              </div>
            )}

            {updateStatus() === 'installing' && (
              <div class="flex items-center justify-center gap-2 text-sm text-success">
                <span class="loading loading-spinner loading-xs"></span>
                {t("about.updateInstalling")}
              </div>
            )}

            {updateStatus() === 'error' && (
              <div class="flex items-center justify-center gap-2 text-sm">
                <span class="text-error">{updateError()}</span>
                <button class="btn btn-xs btn-ghost" onClick={() => checkForUpdates(true)}>{t("common.retry")}</button>
              </div>
            )}
          </div>
        )}

        {/* Links */}
        <div class="flex items-center justify-center gap-3">
          <button
            class="btn btn-sm btn-ghost"
            onClick={() => openUrl('https://github.com/AmarBego/Rscoop').catch(console.error)}
          >
            <GithubIcon class="w-4 h-4" />
            {t("about.github")}
          </button>
          <button
            class="btn btn-sm btn-ghost"
            onClick={() => openUrl('https://amarbego.github.io/Rscoop/').catch(console.error)}
          >
            <BookOpen class="w-4 h-4" />
            {t("about.docs")}
          </button>
          <button
            class="btn btn-sm btn-ghost"
            onClick={() => openUrl('https://github.com/AmarBego/Rscoop').catch(console.error)}
          >
            <Star class="w-4 h-4" />
            {t("about.star")}
          </button>
        </div>

        {/* Footer */}
        <div class="text-center text-xs text-base-content/30 pt-4">
          <p>{t("about.copyright", { year: new Date().getFullYear().toString() })}</p>
        </div>
      </div>
    </div>
  );
}
import { createRoot } from "solid-js";
import { createStore } from "solid-js/store";
import { invoke } from "@tauri-apps/api/core";
import { View } from "../types/scoop";

const LOCAL_STORAGE_KEY = 'rscoop-settings';

interface Settings {
  virustotal: {
    enabled: boolean;
    autoScanOnInstall: boolean;
  };
  window: {
    closeToTray: boolean;
    firstTrayNotificationShown: boolean;
  };
  theme: 'dark' | 'light';
  debug: {
    enabled: boolean;
  };
  cleanup: {
    autoCleanupEnabled: boolean;
    cleanupOldVersions: boolean;
    cleanupCache: boolean;
    preserveVersionCount: number;
  };
  buckets: {
    autoUpdateInterval: string; // "off" | "1h" | "6h" | "24h"
    autoUpdatePackagesEnabled: boolean;
  };
  defaultLaunchPage: View;
}

const defaultSettings: Settings = {
  virustotal: {
    enabled: false,
    autoScanOnInstall: false,
  },
  window: {
    closeToTray: true,
    firstTrayNotificationShown: false,
  },
  theme: 'dark',
  debug: {
    enabled: false,
  },
  cleanup: {
    autoCleanupEnabled: false,
    cleanupOldVersions: true,
    cleanupCache: true,
    preserveVersionCount: 3,
  },
  buckets: {
    autoUpdateInterval: "off",
    autoUpdatePackagesEnabled: false,
  },
  defaultLaunchPage: "installed",
};

function createSettingsStore() {
  const getInitialSettings = (): Settings => {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (stored) {
      // Deep merge stored settings with defaults to handle new/missing keys
      const storedSettings = JSON.parse(stored);
      return {
        ...defaultSettings,
        virustotal: {
          ...defaultSettings.virustotal,
          ...storedSettings.virustotal,
        },
        window: {
          ...defaultSettings.window,
          ...storedSettings.window,
        },
        theme: storedSettings.theme || defaultSettings.theme,
        debug: {
          ...defaultSettings.debug,
          ...storedSettings.debug,
        },
        cleanup: {
          ...defaultSettings.cleanup,
          ...storedSettings.cleanup,
        },
        buckets: {
          ...defaultSettings.buckets,
          ...storedSettings.buckets,
        },
        defaultLaunchPage: storedSettings.defaultLaunchPage || defaultSettings.defaultLaunchPage,
      };
    }
    return defaultSettings;
  };

  const [settings, setSettings] = createStore<Settings>(getInitialSettings());

  // Sync cleanup settings to Tauri store on startup so the backend
  // can read them (localStorage is frontend-only).
  const initial = getInitialSettings();
  for (const [key, value] of Object.entries(initial.cleanup)) {
    invoke("set_config_value", { key: `cleanup.${key}`, value }).catch(() => {});
  }

  const saveSettings = (newSettings: Partial<Settings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...newSettings };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  const setVirusTotalSettings = (newVtSettings: Partial<Settings['virustotal']>) => {
    saveSettings({
      virustotal: {
        ...settings.virustotal,
        ...newVtSettings,
      },
    });
  };

  const setWindowSettings = (newWindowSettings: Partial<Settings['window']>) => {
    saveSettings({
      window: {
        ...settings.window,
        ...newWindowSettings,
      },
    });
  };

  const setTheme = (theme: 'dark' | 'light') => {
    saveSettings({ theme });
  };

  const setDebugSettings = (newDebugSettings: Partial<Settings['debug']>) => {
    saveSettings({
      debug: {
        ...settings.debug,
        ...newDebugSettings,
      },
    });
  };

  const setCleanupSettings = (newCleanupSettings: Partial<Settings['cleanup']>) => {
    const merged = { ...settings.cleanup, ...newCleanupSettings };
    saveSettings({ cleanup: merged });

    // Sync to Tauri store so the backend can read cleanup settings
    for (const [key, value] of Object.entries(merged)) {
      invoke("set_config_value", { key: `cleanup.${key}`, value }).catch((e) =>
        console.error(`Failed to sync cleanup setting cleanup.${key}:`, e)
      );
    }
  };

  const setBucketSettings = (newBucketSettings: Partial<Settings['buckets']>) => {
    saveSettings({
      buckets: {
        ...settings.buckets,
        ...newBucketSettings,
      },
    });
  };

  const setDefaultLaunchPage = (page: View) => {
    saveSettings({ defaultLaunchPage: page });
  };

  return { settings, setVirusTotalSettings, setWindowSettings, setDebugSettings, setCleanupSettings, setBucketSettings, setTheme, setDefaultLaunchPage };
}

export default createRoot(createSettingsStore);
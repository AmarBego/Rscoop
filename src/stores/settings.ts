import { createRoot } from "solid-js";
import { createStore } from "solid-js/store";
import { invoke } from "@tauri-apps/api/core";
import { View } from "../types/scoop";
import { getErrorMessage } from "../utils/errors";

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
    autoClearCacheOnUninstall: boolean;
  };
  operations: {
    backgroundByDefault: boolean;
  };
  buckets: {
    autoUpdateInterval: string; // "off" | "1h" | "6h" | "24h"
    autoUpdatePackagesEnabled: boolean;
  };
  language: string;
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
    autoClearCacheOnUninstall: false,
  },
  operations: {
    backgroundByDefault: true,
  },
  buckets: {
    autoUpdateInterval: "off",
    autoUpdatePackagesEnabled: false,
  },
  language: "en",
  defaultLaunchPage: "installed",
};

function createSettingsStore() {
  const getInitialSettings = (): Settings => {
    try {
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
          operations: {
            ...defaultSettings.operations,
            ...storedSettings.operations,
          },
          buckets: {
            ...defaultSettings.buckets,
            ...storedSettings.buckets,
          },
          language: storedSettings.language || defaultSettings.language,
          defaultLaunchPage: storedSettings.defaultLaunchPage || defaultSettings.defaultLaunchPage,
        };
      }
    } catch (error) {
      console.warn(`Failed to load settings from localStorage: ${getErrorMessage(error)}`);
    }
    return defaultSettings;
  };

  const initialSettings = getInitialSettings();
  const [settings, setSettings] = createStore<Settings>(initialSettings);

  // Sync frontend-only localStorage settings to the Tauri store on
  // startup so the Rust scheduler and other backend code can read them.
  const initial = initialSettings;
  for (const [key, value] of Object.entries(initial.cleanup)) {
    invoke("set_config_value", { key: `cleanup.${key}`, value }).catch(() => {});
  }
  for (const [key, value] of Object.entries(initial.buckets)) {
    invoke("set_config_value", { key: `buckets.${key}`, value }).catch(() => {});
  }
  for (const [key, value] of Object.entries(initial.operations)) {
    invoke("set_config_value", { key: `operations.${key}`, value }).catch(() => {});
  }

  const saveSettings = (newSettings: Partial<Settings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...newSettings };
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
      } catch (error) {
        console.warn(`Failed to save settings to localStorage: ${getErrorMessage(error)}`);
      }
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
    const merged = { ...settings.buckets, ...newBucketSettings };
    saveSettings({ buckets: merged });
    for (const [key, value] of Object.entries(merged)) {
      invoke("set_config_value", { key: `buckets.${key}`, value }).catch((e) =>
        console.error(`Failed to sync bucket setting buckets.${key}:`, e)
      );
    }
  };

  const setOperationsSettings = (newOpsSettings: Partial<Settings['operations']>) => {
    const merged = { ...settings.operations, ...newOpsSettings };
    saveSettings({ operations: merged });
    for (const [key, value] of Object.entries(merged)) {
      invoke("set_config_value", { key: `operations.${key}`, value }).catch((e) =>
        console.error(`Failed to sync operations setting operations.${key}:`, e)
      );
    }
  };

  const setLanguage = (lang: string) => {
    saveSettings({ language: lang });
  };

  const setDefaultLaunchPage = (page: View) => {
    saveSettings({ defaultLaunchPage: page });
  };

  return { settings, setVirusTotalSettings, setWindowSettings, setDebugSettings, setCleanupSettings, setBucketSettings, setOperationsSettings, setTheme, setLanguage, setDefaultLaunchPage };
}

export default createRoot(createSettingsStore);

import { createRoot } from "solid-js";
import { createStore } from "solid-js/store";

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
  debug: {
    enabled: boolean;
  };
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
  debug: {
    enabled: false,
  },
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
        debug: {
          ...defaultSettings.debug,
          ...storedSettings.debug,
        },
      };
    }
    return defaultSettings;
  };

  const [settings, setSettings] = createStore<Settings>(getInitialSettings());

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

  const setDebugSettings = (newDebugSettings: Partial<Settings['debug']>) => {
    saveSettings({
      debug: {
        ...settings.debug,
        ...newDebugSettings,
      },
    });
  };

  return { settings, setVirusTotalSettings, setWindowSettings, setDebugSettings };
}

export default createRoot(createSettingsStore); 
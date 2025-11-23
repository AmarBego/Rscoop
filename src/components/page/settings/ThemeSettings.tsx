import { Sun, Moon } from "lucide-solid";
import settingsStore from "../../../stores/settings";

function ThemeSettings() {
    const { settings, setTheme } = settingsStore;

    const handleThemeChange = (isLight: boolean) => {
        setTheme(isLight ? 'light' : 'dark');
    };

    return (
        <div class="card bg-base-200 shadow-xl">
            <div class="card-body">
                <div class="flex items-center justify-between">
                    <h2 class="card-title text-xl">
                        <div class="indicator">
                            <div class="flex items-center">
                                {settings.theme === 'dark' ? (
                                    <Moon class="w-6 h-6 mr-2 text-primary" />
                                ) : (
                                    <Sun class="w-6 h-6 mr-2 text-warning" />
                                )}
                                Theme
                            </div>
                        </div>
                    </h2>
                    <div class="form-control">
                        <label class="label cursor-pointer">
                            <span class="label-text mr-4">{settings.theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
                            <input
                                type="checkbox"
                                class="toggle toggle-warning"
                                checked={settings.theme === 'light'}
                                onChange={(e) => handleThemeChange(e.currentTarget.checked)}
                            />
                        </label>
                    </div>
                </div>
                <p class="text-base-content/80">
                    Switch between dark and light themes.
                </p>
            </div>
        </div>
    );
}

export default ThemeSettings;

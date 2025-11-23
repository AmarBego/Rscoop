import { Sun, Moon } from "lucide-solid";
import settingsStore from "../../../stores/settings";
import Card from "../../common/Card";

function ThemeSettings() {
    const { settings, setTheme } = settingsStore;

    const handleThemeChange = (isLight: boolean) => {
        setTheme(isLight ? 'light' : 'dark');
    };

    return (
        <Card
            title="Appearance"
            icon={settings.theme === 'dark' ? Moon : Sun}
            description="Switch between dark and light themes."
            headerAction={
                <label class="label cursor-pointer">
                    <span class="label-text mr-4">{settings.theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}</span>
                    <input
                        type="checkbox"
                        class="toggle toggle-warning"
                        checked={settings.theme === 'light'}
                        onChange={(e) => handleThemeChange(e.currentTarget.checked)}
                    />
                </label>
            }
        />
    );
}

export default ThemeSettings;

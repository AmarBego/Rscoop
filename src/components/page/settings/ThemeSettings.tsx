import { Sun, Moon } from "lucide-solid";
import settingsStore from "../../../stores/settings";
import Card from "../../common/Card";
import { useI18n } from "../../../i18n";

function ThemeSettings() {
    const { t } = useI18n();
    const { settings, setTheme } = settingsStore;

    const handleThemeChange = (isLight: boolean) => {
        setTheme(isLight ? 'light' : 'dark');
    };

    return (
        <Card
            title={t("settings.theme.title")}
            icon={settings.theme === 'dark' ? Moon : Sun}
            description={t("settings.theme.description")}
            headerAction={
                <label class="label cursor-pointer">
                    <span class="label-text mr-4">{settings.theme === 'dark' ? t("settings.theme.switchToLight") : t("settings.theme.switchToDark")}</span>
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

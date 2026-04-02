import { Bug } from "lucide-solid";
import settingsStore from "../../../stores/settings";
import SettingsToggle from "../../common/SettingsToggle";
import Card from "../../common/Card";
import { useI18n } from "../../../i18n";

function DebugSettings() {
    const { t } = useI18n();
    const { settings, setDebugSettings } = settingsStore;

    return (
        <Card
            title={t("settings.debug.title")}
            icon={Bug}
            description={t("settings.debug.description")}
            headerAction={
                <SettingsToggle
                    checked={settings.debug.enabled}
                    onChange={(checked) => setDebugSettings({ enabled: checked })}
                    showStatusLabel={true}
                />
            }
        />
    );
}

export default DebugSettings;

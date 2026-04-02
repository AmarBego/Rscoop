import { Layers } from "lucide-solid";
import settingsStore from "../../../stores/settings";
import SettingsToggle from "../../common/SettingsToggle";
import Card from "../../common/Card";
import { useI18n } from "../../../i18n";

function OperationSettings() {
    const { t } = useI18n();
    const { settings, setOperationsSettings } = settingsStore;

    return (
        <Card
            title={t("settings.operations.title")}
            icon={Layers}
            description={t("settings.operations.description")}
            headerAction={
                <SettingsToggle
                    checked={settings.operations.backgroundByDefault}
                    onChange={(checked) => setOperationsSettings({ backgroundByDefault: checked })}
                    showStatusLabel={true}
                />
            }
        />
    );
}

export default OperationSettings;

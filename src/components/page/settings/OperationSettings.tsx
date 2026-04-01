import { Layers } from "lucide-solid";
import settingsStore from "../../../stores/settings";
import SettingsToggle from "../../common/SettingsToggle";
import Card from "../../common/Card";

function OperationSettings() {
    const { settings, setOperationsSettings } = settingsStore;

    return (
        <Card
            title="Background Operations"
            icon={Layers}
            description="Run installs and uninstalls in the background by default. You can always restore the full modal from the progress bar."
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

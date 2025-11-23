import { Bug } from "lucide-solid";
import settingsStore from "../../../stores/settings";
import SettingsToggle from "../../common/SettingsToggle";
import Card from "../../common/Card";

function DebugSettings() {
    const { settings, setDebugSettings } = settingsStore;

    return (
        <Card
            title="Debug Mode"
            icon={Bug}
            description="Enable debug mode to access detailed system information, logs, and troubleshooting tools."
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

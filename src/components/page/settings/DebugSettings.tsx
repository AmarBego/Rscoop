import { Bug } from "lucide-solid";
import settingsStore from "../../../stores/settings";

function DebugSettings() {
    const { settings, setDebugSettings } = settingsStore;

    return (
        <div class="card bg-base-200 shadow-xl">
            <div class="card-body">
                <div class="flex items-center justify-between">
                    <h2 class="card-title text-xl">
                        <Bug class="w-6 h-6 mr-2 text-primary" />
                        Debug Mode
                    </h2>
                    <div class="form-control">
                        <label class="label cursor-pointer">
                            <span class="label-text mr-4">Enable</span>
                            <input
                                type="checkbox"
                                class="toggle toggle-primary"
                                checked={settings.debug.enabled}
                                onChange={(e) => setDebugSettings({ enabled: e.currentTarget.checked })}
                            />
                        </label>
                    </div>
                </div>
                <p class="text-base-content/80 mb-4">
                    Enable debug mode to access detailed system information, logs, and troubleshooting tools.
                </p>
            </div>
        </div>
    );
}

export default DebugSettings;

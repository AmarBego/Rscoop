import { createSignal, Show } from "solid-js";
import { Recycle, Sparkles } from "lucide-solid";
import settingsStore from "../../../stores/settings";

function AutoCleanupSettings() {
    const { settings, setCleanupSettings } = settingsStore;
    const [localVersionCount, setLocalVersionCount] = createSignal(settings.cleanup.preserveVersionCount);

    const handleVersionCountChange = (e: Event) => {
        const value = parseInt((e.target as HTMLInputElement).value);
        setLocalVersionCount(value);
        if (value >= 1 && value <= 10) {
            setCleanupSettings({ preserveVersionCount: value });
        }
    };

    return (
        <div class="card bg-base-200 shadow-xl">
            <div class="card-body">
                <div class="flex items-center justify-between mb-2">
                    <h2 class="card-title text-xl">
                        <Recycle class="w-6 h-6 mr-2 text-primary" />
                        Auto Cleanup
                    </h2>
                    <label class="label cursor-pointer gap-3">
                        <span class="label-text">Enable</span>
                        <input
                            type="checkbox"
                            class="toggle toggle-primary"
                            checked={settings.cleanup.autoCleanupEnabled}
                            onChange={(e) => setCleanupSettings({ autoCleanupEnabled: e.currentTarget.checked })}
                        />
                    </label>
                </div>
                <p class="text-base-content/80 mb-4 text-sm">
                    Automatically tidy up old package versions and outdated cache assets after install, update, or uninstall operations.
                </p>

                <Show when={settings.cleanup.autoCleanupEnabled}>
                    <div class="space-y-6">
                        {/* Old Versions Section */}
                        <div class="bg-base-300/60 rounded-lg p-4 border border-base-content/10">
                            <div class="flex items-start justify-between">
                                <div class="flex-1">
                                    <h3 class="font-medium flex items-center text-sm">
                                        <Sparkles class="w-4 h-4 mr-2 text-warning" />
                                        Clean Old Versions
                                    </h3>
                                    <p class="text-xs mt-1 text-base-content/60">
                                        Keep only the most recent versions of packages. Versioned installs (using <code>@version</code>) are always preserved.
                                    </p>
                                </div>
                                <input
                                    type="checkbox"
                                    class="toggle toggle-warning"
                                    checked={settings.cleanup.cleanupOldVersions}
                                    onChange={(e) => setCleanupSettings({ cleanupOldVersions: e.currentTarget.checked })}
                                />
                            </div>

                            <Show when={settings.cleanup.cleanupOldVersions}>
                                <div class="mt-4">
                                    <label for="preserveVersionCount" class="block text-xs font-semibold mb-2">
                                        Versions to Keep: <span class="text-primary">{localVersionCount()}</span>
                                    </label>
                                    <input
                                        type="range"
                                        id="preserveVersionCount"
                                        min="1"
                                        max="10"
                                        value={localVersionCount()}
                                        onInput={handleVersionCountChange}
                                        class="range range-primary"
                                    />
                                </div>
                            </Show>
                        </div>

                        {/* Cache Section */}
                        <div class="bg-base-300/60 rounded-lg p-4 border border-base-content/10">
                            <div class="flex items-start justify-between">
                                <div class="flex-1">
                                    <h3 class="font-medium text-sm">Clean Outdated Cache</h3>
                                    <p class="text-xs mt-1 text-base-content/60">
                                        Remove stale downloaded artifacts that are no longer needed, freeing disk space.
                                    </p>
                                </div>
                                <input
                                    type="checkbox"
                                    class="toggle toggle-info"
                                    checked={settings.cleanup.cleanupCache}
                                    onChange={(e) => setCleanupSettings({ cleanupCache: e.currentTarget.checked })}
                                />
                            </div>
                        </div>
                    </div>
                </Show>
            </div>
        </div>
    );
}

export default AutoCleanupSettings;

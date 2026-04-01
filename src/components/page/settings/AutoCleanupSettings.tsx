import { createSignal, Show } from "solid-js";
import { Recycle } from "lucide-solid";
import settingsStore from "../../../stores/settings";
import SettingsToggle from "../../common/SettingsToggle";
import Card from "../../common/Card";

function AutoCleanupSettings() {
    const { settings, setCleanupSettings } = settingsStore;
    const [localVersionCount, setLocalVersionCount] = createSignal(settings.cleanup.preserveVersionCount);

    const handleVersionCountChange = (value: number) => {
        const clamped = Math.max(1, Math.min(10, value));
        setLocalVersionCount(clamped);
        setCleanupSettings({ preserveVersionCount: clamped });
    };

    return (
        <Card
            title="Auto Cleanup"
            icon={Recycle}
            description="Tidy up old package versions and stale cache after install, update, or uninstall."
            headerAction={
                <SettingsToggle
                    checked={settings.cleanup.autoCleanupEnabled}
                    onChange={(checked) => setCleanupSettings({ autoCleanupEnabled: checked })}
                    showStatusLabel={true}
                    className="gap-3"
                />
            }
        >

            <Show when={settings.cleanup.autoCleanupEnabled}>
                <div class="border-t border-base-content/10" />
                <div class="space-y-3">
                    {/* Clean old versions */}
                    <div class="flex items-center justify-between py-2">
                        <div class="flex-1">
                            <span class="text-sm font-medium">Clean old versions</span>
                            <p class="text-xs text-base-content/50">
                                Versioned installs (<code class="text-xs">@version</code>) are always kept.
                            </p>
                        </div>
                        <input
                            type="checkbox"
                            class="toggle toggle-primary"
                            checked={settings.cleanup.cleanupOldVersions}
                            onChange={(e) => setCleanupSettings({ cleanupOldVersions: e.currentTarget.checked })}
                        />
                    </div>

                    <Show when={settings.cleanup.cleanupOldVersions}>
                        <div class="flex items-center gap-3 pl-1">
                            <span class="text-xs text-base-content/60">Versions to keep</span>
                            <div class="flex items-center gap-1">
                                <button
                                    class="btn btn-xs btn-ghost font-mono"
                                    onClick={() => handleVersionCountChange(localVersionCount() - 1)}
                                    disabled={localVersionCount() <= 1}
                                >
                                    -
                                </button>
                                <span class="text-sm font-mono w-6 text-center font-semibold text-primary">
                                    {localVersionCount()}
                                </span>
                                <button
                                    class="btn btn-xs btn-ghost font-mono"
                                    onClick={() => handleVersionCountChange(localVersionCount() + 1)}
                                    disabled={localVersionCount() >= 10}
                                >
                                    +
                                </button>
                            </div>
                        </div>
                    </Show>

                    <div class="border-t border-base-content/10" />

                    {/* Clean outdated cache */}
                    <div class="flex items-center justify-between py-2">
                        <div class="flex-1">
                            <span class="text-sm font-medium">Clean outdated cache</span>
                            <p class="text-xs text-base-content/50">Remove stale downloads that are no longer needed.</p>
                        </div>
                        <input
                            type="checkbox"
                            class="toggle toggle-primary"
                            checked={settings.cleanup.cleanupCache}
                            onChange={(e) => setCleanupSettings({ cleanupCache: e.currentTarget.checked })}
                        />
                    </div>

                    <div class="border-t border-base-content/10" />

                    {/* Auto clear cache on uninstall */}
                    <div class="flex items-center justify-between py-2">
                        <div class="flex-1">
                            <span class="text-sm font-medium">Clear cache on uninstall</span>
                            <p class="text-xs text-base-content/50">Automatically remove cached installers when a package is uninstalled.</p>
                        </div>
                        <input
                            type="checkbox"
                            class="toggle toggle-primary"
                            checked={settings.cleanup.autoClearCacheOnUninstall}
                            onChange={(e) => setCleanupSettings({ autoClearCacheOnUninstall: e.currentTarget.checked })}
                        />
                    </div>
                </div>
            </Show>
        </Card>
    );
}

export default AutoCleanupSettings;

import { createSignal, createEffect, onMount, For, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import ScoopConfiguration from "../components/page/settings/ScoopConfiguration";
import VirusTotalSettings from "../components/page/settings/VirusTotalSettings";
import WindowBehaviorSettings from "../components/page/settings/WindowBehaviorSettings";
import HeldPackagesManagement from "../components/page/settings/HeldPackagesManagement";
import ExportImportSettings from "../components/page/settings/ExportImportSettings";
import AboutSection, { AboutSectionRef } from "../components/page/settings/AboutSection";
import DebugSettings from "../components/page/settings/DebugSettings";
import AutoCleanupSettings from "../components/page/settings/AutoCleanupSettings";
import BucketAutoUpdateSettings from "../components/page/settings/BucketAutoUpdateSettings";
import OperationSettings from "../components/page/settings/OperationSettings";
import StartupSettings from "../components/page/settings/StartupSettings";
import ThemeSettings from "../components/page/settings/ThemeSettings";
import DefaultLaunchPageSettings from "../components/page/settings/DefaultLaunchPageSettings";
import LanguageSettings from "../components/page/settings/LanguageSettings";
import TrayMenuSettings from "../components/page/settings/TrayMenuSettings";
import heldStore from "../stores/held";
import { useI18n } from "../i18n";

interface SettingsPageProps {
    isScoopInstalled?: boolean;
    /** Requested tab key — set by deep-link navigations (e.g. tray
     *  "Edit Tray Menu…"). SettingsPage activates the tab then calls
     *  `onTabConsumed` to clear it so it doesn't re-fire on re-render. */
    pendingTab?: string | null;
    onTabConsumed?: () => void;
}

function SettingsPage(props: SettingsPageProps) {
    const { t } = useI18n();
    const { refetch: refetchHeldPackages } = heldStore;
    const [isUnholding, setIsUnholding] = createSignal(false);
    let aboutSectionRef: AboutSectionRef | undefined;

    const TABS = [
        { key: 'automation', labelKey: "settings.tabAutomation" },
        { key: 'management', labelKey: "settings.tabManagement" },
        { key: 'security', labelKey: "settings.tabSecurity" },
        { key: 'window', labelKey: "settings.tabWindow" },
        { key: 'tray', labelKey: "settings.tabTray" },
        { key: 'about', labelKey: "settings.tabAbout" },
    ];
    const [activeTab, setActiveTab] = createSignal<string>('automation');
    const activeIndex = () => TABS.findIndex(tab => tab.key === activeTab());
    const tabId = (key: string) => `settings-tab-${key}`;
    const panelId = (key: string) => `settings-panel-${key}`;

    onMount(() => {
        // Preload update info silently
        aboutSectionRef?.checkForUpdates(false);
    });

    // React to deep-link tab requests (tray "Edit Tray Menu…" etc.).
    createEffect(() => {
        const requested = props.pendingTab;
        if (requested && TABS.some(t => t.key === requested)) {
            setActiveTab(requested);
            props.onTabConsumed?.();
        }
    });

    const handleUnhold = (packageName: string) => {
        setIsUnholding(true);
        invoke("unhold_package", { packageName }).finally(() => {
            refetchHeldPackages();
            setIsUnholding(false);
        });
    };

    const focusTab = (index: number) => {
        const next = TABS[(index + TABS.length) % TABS.length];
        setActiveTab(next.key);
        document.getElementById(tabId(next.key))?.focus();
    };

    const handleTabKeyDown = (e: KeyboardEvent) => {
        switch (e.key) {
            case "ArrowRight":
            case "ArrowDown":
                e.preventDefault();
                focusTab(activeIndex() + 1);
                break;
            case "ArrowLeft":
            case "ArrowUp":
                e.preventDefault();
                focusTab(activeIndex() - 1);
                break;
            case "Home":
                e.preventDefault();
                focusTab(0);
                break;
            case "End":
                e.preventDefault();
                focusTab(TABS.length - 1);
                break;
        }
    };

    return (
        <div class="p-0 sm:p-2">
                <h1 class="text-2xl sm:text-3xl font-bold mb-4">{t("settings.title")}</h1>
                {/* Tab Navigation */}
                <div role="tablist" aria-label={t("settings.title")} class="tabs tabs-border mb-6 -mx-1 px-1 overflow-x-auto flex-nowrap touch-pan-x [scrollbar-width:none]">
                    <For each={TABS}>
                        {(tab) => (
                            <button
                                id={tabId(tab.key)}
                                type="button"
                                class="tab px-3 whitespace-nowrap shrink-0"
                                classList={{ 'tab-active': activeTab() === tab.key }}
                                onClick={() => setActiveTab(tab.key)}
                                onKeyDown={handleTabKeyDown}
                                role="tab"
                                aria-selected={activeTab() === tab.key}
                                aria-controls={panelId(tab.key)}
                                tabindex={activeTab() === tab.key ? 0 : -1}
                            >
                                {t(tab.labelKey)}
                            </button>
                        )}
                    </For>
                </div>

                <div class="space-y-6">
                    {/* Automation Tab */}
                    <Show when={activeTab() === 'automation'}>
                        <div id={panelId("automation")} role="tabpanel" aria-labelledby={tabId("automation")} tabindex="0" class="space-y-6 sm:space-y-8">
                            <AutoCleanupSettings />
                            <OperationSettings />
                            <BucketAutoUpdateSettings />
                        </div>
                    </Show>

                    {/* Management Tab */}
                    <Show when={activeTab() === 'management'}>
                        <div id={panelId("management")} role="tabpanel" aria-labelledby={tabId("management")} tabindex="0" class="space-y-6 sm:space-y-8">
                            <ScoopConfiguration />
                            <HeldPackagesManagement
                                onUnhold={handleUnhold}
                                operationInProgress={isUnholding()}
                            />
                            <ExportImportSettings />
                        </div>
                    </Show>

                    {/* Security Tab */}
                    <Show when={activeTab() === 'security'}>
                        <div id={panelId("security")} role="tabpanel" aria-labelledby={tabId("security")} tabindex="0" class="space-y-6 sm:space-y-8">
                            <VirusTotalSettings />
                        </div>
                    </Show>

                    {/* Window & UI Tab */}
                    <Show when={activeTab() === 'window'}>
                        <div id={panelId("window")} role="tabpanel" aria-labelledby={tabId("window")} tabindex="0" class="space-y-6 sm:space-y-8">
                            <ThemeSettings />
                            <LanguageSettings />
                            <WindowBehaviorSettings />
                            <StartupSettings />
                            <DefaultLaunchPageSettings />
                            <DebugSettings />
                        </div>
                    </Show>

                    {/* Tray Menu Tab */}
                    <Show when={activeTab() === 'tray'}>
                        <div id={panelId("tray")} role="tabpanel" aria-labelledby={tabId("tray")} tabindex="0">
                            <TrayMenuSettings />
                        </div>
                    </Show>

                    {/* About Tab */}
                    <Show when={activeTab() === 'about'}>
                        <div id={panelId("about")} role="tabpanel" aria-labelledby={tabId("about")} tabindex="0">
                            <AboutSection
                                ref={(r) => (aboutSectionRef = r)}
                                isScoopInstalled={props.isScoopInstalled}
                            />
                        </div>
                    </Show>
                </div>
        </div>
    );
}

export default SettingsPage;

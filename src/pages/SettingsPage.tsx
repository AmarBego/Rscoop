import { createSignal, onMount, For, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import ScoopConfiguration from "../components/page/settings/ScoopConfiguration";
import VirusTotalSettings from "../components/page/settings/VirusTotalSettings";
import WindowBehaviorSettings from "../components/page/settings/WindowBehaviorSettings";
import HeldPackagesManagement from "../components/page/settings/HeldPackagesManagement";
import AboutSection, { AboutSectionRef } from "../components/page/settings/AboutSection";
import DebugSettings from "../components/page/settings/DebugSettings";
import AutoCleanupSettings from "../components/page/settings/AutoCleanupSettings";
import BucketAutoUpdateSettings from "../components/page/settings/BucketAutoUpdateSettings";
import OperationSettings from "../components/page/settings/OperationSettings";
import StartupSettings from "../components/page/settings/StartupSettings";
import ThemeSettings from "../components/page/settings/ThemeSettings";
import DefaultLaunchPageSettings from "../components/page/settings/DefaultLaunchPageSettings";
import LanguageSettings from "../components/page/settings/LanguageSettings";
import heldStore from "../stores/held";
import { useI18n } from "../i18n";

interface SettingsPageProps {
    isScoopInstalled?: boolean;
}

function SettingsPage(props: SettingsPageProps) {
    const { t } = useI18n();
    const { refetch: refetchHeldPackages } = heldStore;
    const [isUnholding, setIsUnholding] = createSignal(false);
    let aboutSectionRef: AboutSectionRef | undefined;

    const TABS = [
        { key: 'automation', label: t("settings.tabAutomation") },
        { key: 'management', label: t("settings.tabManagement") },
        { key: 'security', label: t("settings.tabSecurity") },
        { key: 'window', label: t("settings.tabWindow") },
        { key: 'about', label: t("settings.tabAbout") },
    ];
    const [activeTab, setActiveTab] = createSignal<string>('automation');

    onMount(() => {
        // Preload update info silently
        aboutSectionRef?.checkForUpdates(false);
    });

    const handleUnhold = (packageName: string) => {
        setIsUnholding(true);
        invoke("unhold_package", { packageName }).finally(() => {
            refetchHeldPackages();
            setIsUnholding(false);
        });
    };

    return (
        <div class="p-2">
                <h1 class="text-3xl font-bold mb-4">{t("settings.title")}</h1>
                {/* Tab Navigation */}
                <div role="tablist" aria-label="Settings Sections" class="tabs tabs-border mb-6">
                    <For each={TABS}>
                        {(tab) => (
                            <a
                                class="tab"
                                classList={{ 'tab-active': activeTab() === tab.key }}
                                onClick={() => setActiveTab(tab.key)}
                                role="tab"
                                aria-selected={activeTab() === tab.key}
                            >
                                {tab.label}
                            </a>
                        )}
                    </For>
                </div>

                <div class="space-y-6">
                    {/* Automation Tab */}
                    <Show when={activeTab() === 'automation'}>
                        <div class="space-y-8">
                            <AutoCleanupSettings />
                            <OperationSettings />
                            <BucketAutoUpdateSettings />
                        </div>
                    </Show>

                    {/* Management Tab */}
                    <Show when={activeTab() === 'management'}>
                        <div class="space-y-8">
                            <ScoopConfiguration />
                            <HeldPackagesManagement
                                onUnhold={handleUnhold}
                                operationInProgress={isUnholding()}
                            />
                        </div>
                    </Show>

                    {/* Security Tab */}
                    <Show when={activeTab() === 'security'}>
                        <div class="space-y-8">
                            <VirusTotalSettings />
                        </div>
                    </Show>

                    {/* Window & UI Tab */}
                    <Show when={activeTab() === 'window'}>
                        <div class="space-y-8">
                            <ThemeSettings />
                            <LanguageSettings />
                            <WindowBehaviorSettings />
                            <StartupSettings />
                            <DefaultLaunchPageSettings />
                            <DebugSettings />
                        </div>
                    </Show>

                    {/* About Tab */}
                    <Show when={activeTab() === 'about'}>
                        <AboutSection
                            ref={(r) => (aboutSectionRef = r)}
                            isScoopInstalled={props.isScoopInstalled}
                        />
                    </Show>
                </div>
        </div>
    );
}

export default SettingsPage;
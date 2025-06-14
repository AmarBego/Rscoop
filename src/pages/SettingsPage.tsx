import { createSignal, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import OperationModal from "../components/OperationModal";
import ScoopConfiguration from "../components/page/settings/ScoopConfiguration";
import VirusTotalSettings from "../components/page/settings/VirusTotalSettings";
import HeldPackagesManagement from "../components/page/settings/HeldPackagesManagement";
import AboutSection, { AboutSectionRef } from "../components/page/settings/AboutSection";
import heldStore from "../stores/held";

function SettingsPage() {
    const { refetch: refetchHeldPackages } = heldStore;
    const [operationTitle, setOperationTitle] = createSignal<string | null>(null);
    let aboutSectionRef: AboutSectionRef | undefined;

    onMount(() => {
        aboutSectionRef?.checkForUpdates(false);
    });

    const handleUnhold = (packageName: string) => {
        setOperationTitle(`Removing hold from ${packageName}...`);
        invoke("unhold_package", { packageName }).finally(() => {
            refetchHeldPackages();
        });
    };

    const handleCloseOperationModal = () => {
        setOperationTitle(null);
    };

    return (
        <>
            <div class="p-4 sm:p-6 md:p-8">
                <h1 class="text-3xl font-bold mb-6">Settings</h1>
                
                <div class="space-y-8">
                    <ScoopConfiguration />
                    <VirusTotalSettings />
                    <HeldPackagesManagement 
                        onUnhold={handleUnhold}
                        operationInProgress={!!operationTitle()}
                    />
                    <AboutSection ref={(r) => (aboutSectionRef = r)} />
                </div>
            </div>
            <OperationModal
                title={operationTitle()}
                onClose={handleCloseOperationModal}
            />
        </>
    );
}

export default SettingsPage; 
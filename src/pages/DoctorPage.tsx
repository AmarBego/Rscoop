import { createSignal, onMount, createMemo, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import Checkup, { CheckupItem } from "../components/page/doctor/Checkup";
import Cleanup from "../components/page/doctor/Cleanup";
import CacheManager from "../components/page/doctor/CacheManager";
import ShimManager from "../components/page/doctor/ShimManager";
import OperationModal from "../components/OperationModal";
import installedPackagesStore from "../stores/installedPackagesStore";

function DoctorPage() {
    const [operationTitle, setOperationTitle] = createSignal<string | null>(null);
    const [installingHelper, setInstallingHelper] = createSignal<string | null>(null);

    // State lifted from Checkup.tsx
    const [checkupResult, setCheckupResult] = createSignal<CheckupItem[]>([]);
    const [isCheckupLoading, setIsCheckupLoading] = createSignal(true);
    const [checkupError, setCheckupError] = createSignal<string | null>(null);

    // Logic for running checkup, now in the parent component
    const runCheckup = async () => {
        setIsCheckupLoading(true);
        setCheckupError(null);
        try {
            const result = await invoke<CheckupItem[]>("run_scoop_checkup");
            setCheckupResult(result);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("Failed to run sfsu checkup:", errorMsg);
            setCheckupError("Could not run sfsu checkup. Please ensure 'sfsu' is installed and accessible in your PATH.");
            setCheckupResult([]);
        } finally {
            setIsCheckupLoading(false);
        }
    };

    onMount(runCheckup);

    // Derived state to determine if checkup requires attention
    const needsAttention = createMemo(() => {
        if (isCheckupLoading() || checkupError() || checkupResult().length === 0) {
            return false;
        }
        // Needs attention if any item is not OK (status is false)
        return checkupResult().some(item => !item.status);
    });

    const handleInstallHelper = async (helperId: string) => {
        setInstallingHelper(helperId);
        try {
            await invoke("install_package", { packageName: helperId, bucket: '' });
            await runCheckup();
            installedPackagesStore.refetch();
        } catch (err) {
            console.error(`Failed to install ${helperId}:`, err);
        } finally {
            setInstallingHelper(null);
        }
    };

    const runOperation = (title: string, command: Promise<any>) => {
        setOperationTitle(title);
        command.catch(err => {
            console.error(`Operation "${title}" failed:`, err);
        }).finally(() => {
            // Modal closure is handled by its own event
        });
    };

    const handleCleanupApps = () => {
        runOperation(
            "Cleaning up old app versions...",
            invoke("cleanup_all_apps")
        );
    };

    const handleCleanupCache = () => {
        runOperation(
            "Cleaning up outdated cache...",
            invoke("cleanup_outdated_cache")
        );
    };

    const handleCloseOperationModal = () => {
        setOperationTitle(null);
    };

    return (
        <>
            <div class="p-4">
                <h1 class="text-3xl font-bold mb-6">System Doctor</h1>

                <div class="space-y-8">
                    <Show when={needsAttention()}>
                        <Checkup
                            checkupResult={checkupResult()}
                            isLoading={isCheckupLoading()}
                            error={checkupError()}
                            onRerun={runCheckup}
                            onInstallHelper={handleInstallHelper}
                            installingHelper={installingHelper()}
                        />
                    </Show>

                    <Cleanup
                        onCleanupApps={handleCleanupApps}
                        onCleanupCache={handleCleanupCache}
                    />
                    <CacheManager />
                    <ShimManager />

                    <Show when={!needsAttention()}>
                        <Checkup
                            checkupResult={checkupResult()}
                            isLoading={isCheckupLoading()}
                            error={checkupError()}
                            onRerun={runCheckup}
                            onInstallHelper={handleInstallHelper}
                            installingHelper={installingHelper()}
                        />
                    </Show>
                </div>
            </div>
            <OperationModal
                title={operationTitle()}
                onClose={handleCloseOperationModal}
            />
        </>
    );
}

export default DoctorPage; 
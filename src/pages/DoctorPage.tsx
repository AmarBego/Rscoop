import { createSignal, onMount, createMemo, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import Checkup, { CheckupItem } from "../components/page/doctor/Checkup";
import Cleanup from "../components/page/doctor/Cleanup";
import CacheManager from "../components/page/doctor/CacheManager";
import ShimManager from "../components/page/doctor/ShimManager";
import OperationModal from "../components/OperationModal";

function DoctorPage() {
    const [operationTitle, setOperationTitle] = createSignal<string | null>(null);

    // State lifted from Checkup.tsx
    const [checkupResult, setCheckupResult] = createSignal<CheckupItem[]>([]);
    const [isCheckupLoading, setIsCheckupLoading] = createSignal(true);
    const [checkupError, setCheckupError] = createSignal<string | null>(null);

    // Logic for running checkup, now in the parent component
    const runCheckup = async () => {
        setIsCheckupLoading(true);
        setCheckupError(null);
        try {
            const result = await invoke<CheckupItem[]>("run_sfsu_checkup");
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

    // Derived state to determine if checkup is all green
    const isCheckupAllGreen = createMemo(() => {
        if (isCheckupLoading() || checkupError() || checkupResult().length === 0) {
            return false; // Not green if loading, errored, or empty
        }
        return checkupResult().every(item => item.status);
    });

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
    
    // A function to render the Checkup component, to avoid repetition
    const CheckupComponent = () => (
        <Checkup
            checkupResult={checkupResult()}
            isLoading={isCheckupLoading()}
            error={checkupError()}
            onRerun={runCheckup}
        />
    );

    return (
        <>
            <div class="p-4 sm:p-6 md:p-8">
                <h1 class="text-3xl font-bold mb-6">System Doctor</h1>
                
                <div class="space-y-8">
                    {/* Show at top if there are issues */}
                    <Show when={!isCheckupAllGreen()}>
                        <CheckupComponent />
                    </Show>
                    
                    <Cleanup 
                        onCleanupApps={handleCleanupApps}
                        onCleanupCache={handleCleanupCache}
                    />
                    <CacheManager 
                        onRunOperation={runOperation}
                        isOperationRunning={!!operationTitle()}
                    />
                    <ShimManager
                        onRunOperation={runOperation}
                        isOperationRunning={!!operationTitle()}
                    />

                    {/* Show at bottom if everything is OK */}
                    <Show when={isCheckupAllGreen()}>
                        <CheckupComponent />
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
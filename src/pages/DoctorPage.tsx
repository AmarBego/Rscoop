import { createSignal, onMount, createMemo } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import Checkup, { CheckupItem } from "../components/page/doctor/Checkup";
import Cleanup from "../components/page/doctor/Cleanup";
import CacheManager from "../components/page/doctor/CacheManager";
import ShimManager from "../components/page/doctor/ShimManager";
import installedPackagesStore from "../stores/installedPackagesStore";
import operationsStore from "../stores/operations";
import { ScoopPackage } from "../types/scoop";
import { useI18n } from "../i18n";

function DoctorPage() {
    const { t } = useI18n();
    const [installingHelper, setInstallingHelper] = createSignal<string | null>(null);

    const [checkupResult, setCheckupResult] = createSignal<CheckupItem[]>([]);
    const [isCheckupLoading, setIsCheckupLoading] = createSignal(true);
    const [checkupError, setCheckupError] = createSignal<string | null>(null);

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

    const needsAttention = createMemo(() => {
        if (isCheckupLoading() || checkupError() || checkupResult().length === 0) {
            return false;
        }
        return checkupResult().some(item => !item.status);
    });

    const handleInstallHelper = async (helperId: string) => {
        setInstallingHelper(helperId);
        const helperPackage: ScoopPackage = {
            name: helperId,
            version: "",
            source: "",
            updated: "",
            is_installed: false,
            info: "",
            match_source: "name",
        };
        const id = await operationsStore.queueInstall(
            helperPackage,
            undefined,
            async (wasSuccess) => {
                if (wasSuccess) {
                    await runCheckup();
                    installedPackagesStore.reload();
                }
                setInstallingHelper(null);
            },
            { skipScan: true },
        );

        if (!id) {
            setInstallingHelper(null);
        }
    };

    const handleCleanupApps = () => {
        operationsStore.queueGenericOperation("cleanup-apps");
    };

    const handleCleanupCache = () => {
        operationsStore.queueGenericOperation("cleanup-cache");
    };

    return (
        <div class="p-4">
            <h1 class="text-3xl font-bold tracking-tight mb-6">{t("doctor.title")}</h1>

            <div class="flex flex-col gap-8">
                <div classList={{ "order-first": needsAttention(), "order-last": !needsAttention() }}>
                    <Checkup
                        checkupResult={checkupResult()}
                        isLoading={isCheckupLoading()}
                        error={checkupError()}
                        onRerun={runCheckup}
                        onInstallHelper={handleInstallHelper}
                        installingHelper={installingHelper()}
                    />
                </div>
                <div>
                    <Cleanup
                        onCleanupApps={handleCleanupApps}
                        onCleanupCache={handleCleanupCache}
                    />
                </div>
                <div>
                    <CacheManager />
                </div>
                <div>
                    <ShimManager />
                </div>
            </div>
        </div>
    );
}

export default DoctorPage;

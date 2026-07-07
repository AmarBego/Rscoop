import { createSignal, onMount, createMemo } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import Checkup, { checkupFixKey } from "../components/page/doctor/Checkup";
import type { CheckupItem } from "../components/page/doctor/Checkup";
import Cleanup from "../components/page/doctor/Cleanup";
import CacheManager from "../components/page/doctor/CacheManager";
import ShimManager from "../components/page/doctor/ShimManager";
import installedPackagesStore from "../stores/installedPackagesStore";
import operationsStore from "../stores/operations";
import { ScoopPackage } from "../types/scoop";
import { useI18n } from "../i18n";
import { getErrorMessage } from "../utils/errors";

function DoctorPage() {
    const { t } = useI18n();
    const [runningFix, setRunningFix] = createSignal<string | null>(null);

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
            const errorMsg = getErrorMessage(err);
            console.error("Failed to run system checkup:", errorMsg);
            setCheckupError(t("doctor.checkupError"));
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

    const installPackageFix = async (packageName: string) => {
        const helperPackage: ScoopPackage = {
            name: packageName,
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
                setRunningFix(null);
            },
            { skipScan: true },
        );

        if (!id) {
            setRunningFix(null);
        }
    };

    const handleRunFix = async (item: CheckupItem) => {
        if (!item.fix) return;
        const key = checkupFixKey(item);
        setRunningFix(key);

        try {
            switch (item.fix.kind) {
                case "install-package":
                    await installPackageFix(item.fix.package);
                    return;
                case "install-bucket": {
                    const result = await invoke<{ success: boolean; message: string }>("install_bucket", {
                        options: {
                            name: item.fix.name,
                            url: item.fix.url,
                            force: false,
                        },
                    });
                    if (result.success) {
                        await runCheckup();
                    } else {
                        setCheckupError(result.message);
                    }
                    break;
                }
                case "open-settings":
                    await invoke("open_windows_settings_page", { page: item.fix.page });
                    break;
            }
        } catch (err) {
            const errorMsg = getErrorMessage(err);
            console.error("Failed to run checkup fix:", errorMsg);
            setCheckupError(errorMsg);
        } finally {
            if (runningFix() === key) setRunningFix(null);
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
                        onRunFix={handleRunFix}
                        runningFix={runningFix()}
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

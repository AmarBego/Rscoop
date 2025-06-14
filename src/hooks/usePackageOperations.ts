import { createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { ScoopPackage } from "../types/scoop";
import { OperationNextStep } from "../types/operations";
import installedPackagesStore from "../stores/installedPackagesStore";
import settingsStore from "../stores/settings";

export function usePackageOperations() {
    const [operationTitle, setOperationTitle] = createSignal<string | null>(null);
    const [operationNextStep, setOperationNextStep] = createSignal<OperationNextStep | null>(null);
    const [isScanning, setIsScanning] = createSignal(false);
    const [pendingInstallPackage, setPendingInstallPackage] = createSignal<ScoopPackage | null>(null);
    const { settings } = settingsStore;

    const performInstall = (pkg: ScoopPackage) => {
        setOperationTitle(`Installing ${pkg.name}`);
        setIsScanning(false);
        invoke("install_package", {
            packageName: pkg.name,
            bucket: pkg.source,
        }).catch((err) => {
            console.error("Installation invocation failed:", err);
        });
    };

    const handleInstall = (pkg: ScoopPackage) => {
        if (settings.virustotal.enabled && settings.virustotal.autoScanOnInstall) {
            setOperationTitle(`Scanning ${pkg.name} with VirusTotal...`);
            setIsScanning(true);
            setPendingInstallPackage(pkg);
            invoke("scan_package", {
                packageName: pkg.name,
                bucket: pkg.source,
            }).catch((err) => {
                console.error("Scan invocation failed:", err);
            });
        } else {
            performInstall(pkg);
        }
    };

    const handleInstallConfirm = () => {
        const pkg = pendingInstallPackage();
        if (pkg) {
            performInstall(pkg);
            setPendingInstallPackage(null);
        }
    };

    const handleUninstall = (pkg: ScoopPackage) => {
        setOperationTitle(`Uninstalling ${pkg.name}`);
        setOperationNextStep({
            buttonLabel: "Clear Cache",
            onNext: () => {
                setOperationTitle(`Clearing cache for ${pkg.name}`);
                setOperationNextStep(null);
                invoke("clear_package_cache", {
                    packageName: pkg.name,
                    bucket: pkg.source,
                }).catch((err) => console.error("Clear cache invocation failed:", err));
            },
        });

        invoke("uninstall_package", {
            packageName: pkg.name,
            bucket: pkg.source,
        }).catch((err) => {
            console.error(`Uninstallation invocation failed for ${pkg.name}:`, err);
            setOperationNextStep(null);
        });
    };

    const handleUpdate = (pkg: ScoopPackage) => {
        setOperationTitle(`Updating ${pkg.name}`);
        invoke("update_package", { packageName: pkg.name }).catch(err => {
            console.error("Update invocation failed:", err);
        });
    };

    const handleUpdateAll = () => {
        setOperationTitle("Updating all packages");
        invoke("update_all_packages").catch(err => {
            console.error("Update all invocation failed:", err);
        });
    };

    const closeOperationModal = (wasSuccess: boolean) => {
        setOperationTitle(null);
        setOperationNextStep(null);
        setIsScanning(false);
        setPendingInstallPackage(null);
        if (wasSuccess) {
            installedPackagesStore.refetch();
        }
    };

    return {
        operationTitle,
        operationNextStep,
        isScanning,
        pendingInstallPackage,
        handleInstall,
        handleInstallConfirm,
        handleUninstall,
        handleUpdate,
        handleUpdateAll,
        closeOperationModal,
    };
} 
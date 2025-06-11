import { createSignal, createEffect, on } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { ScoopPackage, ScoopInfo } from "../types/scoop";
import settingsStore from "../stores/settings";
import installedPackagesStore from "../stores/installedPackagesStore";

interface OperationNextStep {
    buttonLabel: string;
    onNext: () => void;
}

export function useSearch() {
    const [searchTerm, setSearchTerm] = createSignal("");
    const [results, setResults] = createSignal<ScoopPackage[]>([]);
    const [loading, setLoading] = createSignal(false);
    const [activeTab, setActiveTab] = createSignal<"packages" | "includes">(
        "packages"
    );

    // For the package info modal
    const [selectedPackage, setSelectedPackage] =
        createSignal<ScoopPackage | null>(null);
    const [info, setInfo] = createSignal<ScoopInfo | null>(null);
    const [infoLoading, setInfoLoading] = createSignal(false);
    const [infoError, setInfoError] = createSignal<string | null>(null);

    // For OperationModal
    const [operationTitle, setOperationTitle] = createSignal<string | null>(null);
    const [operationNextStep, setOperationNextStep] =
        createSignal<OperationNextStep | null>(null);
    const { settings } = settingsStore;
    const [isScanning, setIsScanning] = createSignal(false);
    const [pendingInstallPackage, setPendingInstallPackage] =
        createSignal<ScoopPackage | null>(null);

    let debounceTimer: number;

    const handleSearch = async () => {
        if (searchTerm().trim() === "") {
            setResults([]);
            return;
        }

        setLoading(true);
        try {
            const response = await invoke<{ packages: ScoopPackage[], is_cold: boolean }>("search_scoop", {
                term: searchTerm(),
            });
            setResults(response.packages);
        } catch (error) {
            console.error("Search error:", error);
        } finally {
            setLoading(false);
        }
    };

    createEffect(on(searchTerm, () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => handleSearch(), 300);
    }));

    const performInstall = (pkg: ScoopPackage) => {
        setOperationTitle(`Installing ${pkg.name}`);
        setIsScanning(false);
        invoke("install_package", {
            packageName: pkg.name,
            packageSource: pkg.source,
        }).catch((err) => {
            console.error("Installation invocation failed:", err);
        });
    };

    const handleInstall = (pkg: ScoopPackage) => {
        if (selectedPackage()?.name === pkg.name) {
            closeModal();
        }

        if (settings.virustotal.enabled && settings.virustotal.autoScanOnInstall) {
            setOperationTitle(`Scanning ${pkg.name} with VirusTotal...`);
            setIsScanning(true);
            setPendingInstallPackage(pkg); // Remember which package to install
            invoke("scan_package", {
                packageName: pkg.name,
                packageSource: pkg.source,
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
        if (selectedPackage()?.name === pkg.name) {
            closeModal();
        }
        setOperationTitle(`Uninstalling ${pkg.name}`);
        setOperationNextStep({
            buttonLabel: "Clear Cache",
            onNext: () => {
                setOperationTitle(`Clearing cache for ${pkg.name}`);
                setOperationNextStep(null);
                invoke("clear_package_cache", {
                    packageName: pkg.name,
                    packageSource: pkg.source,
                }).catch((err) => console.error("Clear cache invocation failed:", err));
            },
        });

        invoke("uninstall_package", {
            packageName: pkg.name,
            packageSource: pkg.source,
        }).catch((err) => {
            console.error(`Uninstallation invocation failed for ${pkg.name}:`, err);
            setOperationNextStep(null);
        });
    };

    const fetchPackageInfo = async (pkg: ScoopPackage) => {
        if (selectedPackage()?.name === pkg.name) {
            closeModal();
            return;
        }
        setSelectedPackage(pkg);
        setInfoLoading(true);
        setInfoError(null);
        try {
            const infoResponse = await invoke<ScoopInfo>("get_package_info", {
                packageName: pkg.name,
            });
            setInfo(infoResponse);
        } catch (err) {
            setInfoError(String(err));
        } finally {
            setInfoLoading(false);
        }
    };

    const closeOperationModal = (wasSuccess: boolean) => {
        setOperationTitle(null);
        setOperationNextStep(null);
        setIsScanning(false);
        if (wasSuccess) {
            installedPackagesStore.refetch();
        }
        if (pendingInstallPackage()) {
            setPendingInstallPackage(null);
        }
    };

    const closeModal = () => {
        setSelectedPackage(null);
        setInfo(null);
        setInfoLoading(false);
        setInfoError(null);
    };

    const packageResults = () =>
        results().filter((p) => p.match_source === "name");
    const binaryResults = () =>
        results().filter((p) => p.match_source === "binary");
    const resultsToShow = () => {
        return activeTab() === "packages" ? packageResults() : binaryResults();
    };

    return {
        searchTerm, setSearchTerm,
        loading,
        activeTab, setActiveTab,
        resultsToShow,
        packageResults,
        binaryResults,
        selectedPackage,
        info,
        infoLoading,
        infoError,
        operationTitle,
        operationNextStep,
        isScanning,
        handleInstall,
        handleUninstall,
        handleInstallConfirm,
        fetchPackageInfo,
        closeModal,
        closeOperationModal,
    };
}
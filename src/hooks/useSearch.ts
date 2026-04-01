import { createSignal, createEffect, on } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { ScoopPackage } from "../types/scoop";
import { usePackageInfo } from "./usePackageInfo";
import operationsStore from "../stores/operations";

export function useSearch() {
    const [searchTerm, setSearchTerm] = createSignal("");
    const [results, setResults] = createSignal<ScoopPackage[]>([]);
    const [loading, setLoading] = createSignal(false);
    const [activeTab, setActiveTab] = createSignal<"packages" | "includes">("packages");

    const packageInfo = usePackageInfo();

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

    const refreshAfterOperation = async () => {
        if (searchTerm().trim() !== "") {
            await handleSearch();
        }
        const currentSelected = packageInfo.selectedPackage();
        if (currentSelected) {
            const updatedPackage = results().find(p => p.name === currentSelected.name);
            if (updatedPackage) {
                packageInfo.updateSelectedPackage(updatedPackage);
            }
        }
    };

    createEffect(on(searchTerm, () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => handleSearch(), 300);
    }));

    const packageResults = () => results().filter((p) => p.match_source === "name");
    const binaryResults = () => results().filter((p) => p.match_source === "binary");
    const resultsToShow = () => {
        return activeTab() === "packages" ? packageResults() : binaryResults();
    };

    const handleInstall = (pkg: ScoopPackage, version?: string) => {
        operationsStore.queueInstall(pkg, version, (wasSuccess) => {
            if (wasSuccess) refreshAfterOperation();
        });
    };

    const handleUninstall = (pkg: ScoopPackage) => {
        operationsStore.queueUninstall(pkg, (wasSuccess) => {
            if (wasSuccess) refreshAfterOperation();
        });
    };

    return {
        searchTerm,
        setSearchTerm,
        loading,
        activeTab,
        setActiveTab,
        resultsToShow,
        packageResults,
        binaryResults,

        selectedPackage: packageInfo.selectedPackage,
        info: packageInfo.info,
        infoLoading: packageInfo.loading,
        infoError: packageInfo.error,
        fetchPackageInfo: packageInfo.fetchPackageInfo,
        closeModal: packageInfo.closeModal,

        handleInstall,
        handleUninstall,
        handleInstallConfirm: operationsStore.handleInstallConfirm,
    };
}

import { createSignal, createEffect, on } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { ScoopPackage } from "../types/scoop";
import { usePackageOperations } from "./usePackageOperations";
import { usePackageInfo } from "./usePackageInfo";

export function useSearch() {
    const [searchTerm, setSearchTerm] = createSignal("");
    const [results, setResults] = createSignal<ScoopPackage[]>([]);
    const [loading, setLoading] = createSignal(false);
    const [activeTab, setActiveTab] = createSignal<"packages" | "includes">(
        "packages"
    );

    // Use shared hooks
    const packageOperations = usePackageOperations();
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

    // Function to refresh search results after package operations
    const refreshSearchResults = async () => {
        if (searchTerm().trim() !== "") {
            console.log('Refreshing search results after package operation...');
            await handleSearch();
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

    // Enhanced close operation modal that refreshes search results
    const closeOperationModal = async (wasSuccess: boolean) => {
        packageOperations.closeOperationModal(wasSuccess);
        if (wasSuccess) {
            // Refresh search results to reflect installation state changes
            await refreshSearchResults();

            // Update selectedPackage if it exists
            const currentSelected = packageInfo.selectedPackage();
            if (currentSelected) {
                const updatedPackage = results().find(p => p.name === currentSelected.name);
                if (updatedPackage) {
                    packageInfo.updateSelectedPackage(updatedPackage);
                }
            }
        }
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

        // From usePackageInfo
        selectedPackage: packageInfo.selectedPackage,
        info: packageInfo.info,
        infoLoading: packageInfo.loading,
        infoError: packageInfo.error,
        fetchPackageInfo: packageInfo.fetchPackageInfo,
        closeModal: packageInfo.closeModal,

        // From usePackageOperations (with enhanced closeOperationModal)
        operationTitle: packageOperations.operationTitle,
        operationNextStep: packageOperations.operationNextStep,
        isScanning: packageOperations.isScanning,
        handleInstall: packageOperations.handleInstall,
        handleUninstall: packageOperations.handleUninstall,
        handleInstallConfirm: packageOperations.handleInstallConfirm,
        closeOperationModal, // Enhanced version that refreshes search
    };
}
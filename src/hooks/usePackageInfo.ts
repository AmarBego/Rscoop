import { createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { ScoopPackage, ScoopInfo } from "../types/scoop";
import { getErrorMessage } from "../utils/errors";

export function usePackageInfo() {
    const [selectedPackage, setSelectedPackage] = createSignal<ScoopPackage | null>(null);
    const [info, setInfo] = createSignal<ScoopInfo | null>(null);
    const [loading, setLoading] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);

    const fetchPackageInfo = async (pkg: ScoopPackage) => {
        if (selectedPackage()?.name === pkg.name && selectedPackage()?.source === pkg.source) {
            closeModal();
            return;
        }

        setSelectedPackage(pkg);
        setLoading(true);
        setError(null);
        setInfo(null);

        try {
            const infoResponse = await invoke<ScoopInfo>("get_package_info", {
                packageName: pkg.name,
                bucket: pkg.source,
            });
            setInfo(infoResponse);
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setLoading(false);
        }
    };

    const closeModal = () => {
        setSelectedPackage(null);
        setInfo(null);
        setLoading(false);
        setError(null);
    };

    const updateSelectedPackage = (pkg: ScoopPackage) => {
        // Keep the exact bucket selected when names exist in multiple buckets.
        if (selectedPackage()?.name === pkg.name && selectedPackage()?.source === pkg.source) {
            setSelectedPackage(pkg);
        }
    };

    return {
        selectedPackage,
        info,
        loading,
        error,
        fetchPackageInfo,
        closeModal,
        updateSelectedPackage,
    };
}

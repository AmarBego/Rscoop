import { createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { ScoopPackage, ScoopInfo } from "../types/scoop";

export function usePackageInfo() {
    const [selectedPackage, setSelectedPackage] = createSignal<ScoopPackage | null>(null);
    const [info, setInfo] = createSignal<ScoopInfo | null>(null);
    const [loading, setLoading] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);

    const fetchPackageInfo = async (pkg: ScoopPackage) => {
        if (selectedPackage()?.name === pkg.name) {
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
            });
            setInfo(infoResponse);
        } catch (err) {
            setError(String(err));
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

    return {
        selectedPackage,
        info,
        loading,
        error,
        fetchPackageInfo,
        closeModal,
    };
} 
import { createSignal, onMount, createMemo } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { ScoopPackage, ScoopInfo } from "../types/scoop";
import { createStoredSignal } from "./createStoredSignal";
import heldStore from "../stores/held";
import installedPackagesStore from "../stores/installedPackagesStore";

type SortKey = 'name' | 'version' | 'source' | 'updated';

interface OperationNextStep {
  buttonLabel: string;
  onNext: () => void;
}

export function useInstalledPackages() {
  const { packages, loading, error, uniqueBuckets, isCheckingForUpdates, fetch, refetch } = installedPackagesStore;

  const [operatingOn, setOperatingOn] = createSignal<string | null>(null);
  const [selectedPackage, setSelectedPackage] = createSignal<ScoopPackage | null>(null);
  const [info, setInfo] = createSignal<ScoopInfo | null>(null);
  const [infoLoading, setInfoLoading] = createSignal(false);
  const [infoError, setInfoError] = createSignal<string | null>(null);
  const [operationTitle, setOperationTitle] = createSignal<string | null>(null);
  const [operationNextStep, setOperationNextStep] = createSignal<OperationNextStep | null>(null);

  const [viewMode, setViewMode] = createStoredSignal<'grid' | 'list'>('installedViewMode', 'grid');
  const [sortKey, setSortKey] = createStoredSignal<SortKey>('installedSortKey', 'name');
  const [sortDirection, setSortDirection] = createStoredSignal<'asc' | 'desc'>('installedSortDirection', 'asc');
  const [selectedBucket, setSelectedBucket] = createStoredSignal<string>('installedSelectedBucket', 'all');
  
  onMount(fetch);

  const checkForUpdates = () => {
    installedPackagesStore.checkForUpdates();
  };

  const fetchInstalledPackages = () => {
    refetch();
  }

  const handleSort = (key: SortKey) => {
    if (sortKey() === key) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
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

  const handleUninstall = (pkg: ScoopPackage) => {
    if (selectedPackage()?.name === pkg.name) {
      handleCloseInfoModal();
    }

    setOperationTitle(`Uninstalling ${pkg.name}`);
    setOperationNextStep({
      buttonLabel: "Clear Cache",
      onNext: () => {
        setOperationTitle(`Clearing cache for ${pkg.name}`);
        setOperationNextStep(null);
        invoke("clear_package_cache", {
          packageName: pkg.name,
          bucket: pkg.source,
        }).catch(err => console.error("Clear cache invocation failed:", err));
      },
    });

    invoke("uninstall_package", {
      packageName: pkg.name,
      bucket: pkg.source,
    }).catch(err => {
      console.error("Uninstall invocation failed:", err);
      setOperationNextStep(null);
    });
  };

  const handleHold = async (pkgName: string) => {
    setOperatingOn(pkgName);
    try {
      await invoke("hold_package", { packageName: pkgName });
    } catch (err) {
      console.error(`Failed to hold package ${pkgName}:`, err);
      // In a real app, you might show a toast notification here
    } finally {
      await heldStore.refetch();
      installedPackagesStore.checkForUpdates();
      setOperatingOn(null);
    }
  };

  const handleUnhold = async (pkgName: string) => {
    setOperatingOn(pkgName);
    try {
      await invoke("unhold_package", { packageName: pkgName });
    } catch (err) {
      console.error(`Failed to unhold package ${pkgName}:`, err);
    } finally {
      await heldStore.refetch();
      installedPackagesStore.checkForUpdates();
      setOperatingOn(null);
    }
  };

  const handleFetchPackageInfo = async (pkg: ScoopPackage) => {
    if (selectedPackage()?.name === pkg.name) {
      handleCloseInfoModal();
      return;
    }
    setSelectedPackage(pkg);
    setInfoLoading(true);
    setInfoError(null);
    setInfo(null);
    try {
      const result = await invoke<ScoopInfo>("get_package_info", { packageName: pkg.name });
      setInfo(result);
    } catch (err) {
      console.error(`Failed to fetch info for ${pkg.name}:`, err);
      setInfoError(`Failed to load info for ${pkg.name}`);
    } finally {
      setInfoLoading(false);
    }
  };

  const handleCloseInfoModal = () => {
    setSelectedPackage(null);
    setInfo(null);
    setInfoError(null);
  };
  
  const handleCloseOperationModal = (wasSuccess: boolean) => {
    setOperationTitle(null);
    setOperationNextStep(null);
    if (wasSuccess) {
      fetchInstalledPackages();
    }
  };

  const processedPackages = createMemo(() => {
    let pkgs = [...packages()];
    if (selectedBucket() !== 'all') {
      pkgs = pkgs.filter(p => p.source === selectedBucket());
    }
    const key = sortKey();
    const direction = sortDirection();
    const sortedPkgs = [...pkgs];
    sortedPkgs.sort((a, b) => {
      if (key === 'name') {
        const aHasUpdate = !!a.available_version && !heldStore.isHeld(a.name);
        const bHasUpdate = !!b.available_version && !heldStore.isHeld(b.name);
        if (aHasUpdate && !bHasUpdate) return -1;
        if (!aHasUpdate && bHasUpdate) return 1;
      }
      const valA = a[key].toLowerCase();
      const valB = b[key].toLowerCase();
      if (valA < valB) return direction === 'asc' ? -1 : 1;
      if (valA > valB) return direction === 'asc' ? 1 : -1;
      return 0;
    });
    return sortedPkgs;
  });

  const updatableCount = () => packages().filter(p => !!p.available_version && !heldStore.isHeld(p.name)).length;

  return {
    loading,
    error,
    uniqueBuckets,
    isCheckingForUpdates,
    processedPackages,
    updatableCount,
    viewMode, setViewMode,
    sortKey, sortDirection,
    selectedBucket, setSelectedBucket,
    selectedPackage, info, infoLoading, infoError,
    operationTitle,
    operationNextStep,
    operatingOn,
    handleSort,
    handleUpdate,
    handleUpdateAll,
    handleUninstall,
    handleHold,
    handleUnhold,
    handleFetchPackageInfo,
    handleCloseInfoModal,
    handleCloseOperationModal,
    fetchInstalledPackages,
    checkForUpdates,
  };
} 
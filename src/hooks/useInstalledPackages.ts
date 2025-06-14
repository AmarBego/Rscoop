import { createSignal, onMount, createMemo } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { createStoredSignal } from "./createStoredSignal";
import heldStore from "../stores/held";
import installedPackagesStore from "../stores/installedPackagesStore";
import { usePackageOperations } from "./usePackageOperations";
import { usePackageInfo } from "./usePackageInfo";

type SortKey = 'name' | 'version' | 'source' | 'updated';

export function useInstalledPackages() {
  const { packages, loading, error, uniqueBuckets, isCheckingForUpdates, fetch, refetch } = installedPackagesStore;
  const [operatingOn, setOperatingOn] = createSignal<string | null>(null);

  // Use shared hooks
  const packageOperations = usePackageOperations();
  const packageInfo = usePackageInfo();
  
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

  const handleHold = async (pkgName: string) => {
    setOperatingOn(pkgName);
    try {
      await invoke("hold_package", { packageName: pkgName });
    } catch (err) {
      console.error(`Failed to hold package ${pkgName}:`, err);
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
    viewMode, 
    setViewMode,
    sortKey, 
    sortDirection,
    selectedBucket, 
    setSelectedBucket,
    operatingOn,
    
    // From usePackageInfo
    selectedPackage: packageInfo.selectedPackage,
    info: packageInfo.info,
    infoLoading: packageInfo.loading,
    infoError: packageInfo.error,
    handleFetchPackageInfo: packageInfo.fetchPackageInfo,
    handleCloseInfoModal: packageInfo.closeModal,
    
    // From usePackageOperations
    operationTitle: packageOperations.operationTitle,
    operationNextStep: packageOperations.operationNextStep,
    handleUpdate: packageOperations.handleUpdate,
    handleUpdateAll: packageOperations.handleUpdateAll,
    handleUninstall: packageOperations.handleUninstall,
    handleCloseOperationModal: packageOperations.closeOperationModal,
    
    // Local methods
    handleSort,
    handleHold,
    handleUnhold,
    fetchInstalledPackages,
    checkForUpdates,
  };
} 
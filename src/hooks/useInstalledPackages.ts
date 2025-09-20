import { createSignal, onMount, createMemo } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { createStoredSignal } from "./createStoredSignal";
import heldStore from "../stores/held";
import installedPackagesStore from "../stores/installedPackagesStore";
import { usePackageOperations } from "./usePackageOperations";
import { usePackageInfo } from "./usePackageInfo";

type SortKey = 'name' | 'version' | 'source' | 'updated';

// Types for scoop status
interface AppStatusInfo {
  name: string;
  installed_version: string;
  latest_version?: string;
  missing_dependencies: string[];
  info: string[];
  is_outdated: boolean;
  is_failed: boolean;
  is_held: boolean;
  is_deprecated: boolean;
  is_removed: boolean;
}

interface ScoopStatus {
  scoop_needs_update: boolean;
  bucket_needs_update: boolean;
  network_failure: boolean;
  apps_with_issues: AppStatusInfo[];
  is_everything_ok: boolean;
}

export function useInstalledPackages() {
  const { packages, loading, error, uniqueBuckets, isCheckingForUpdates, isPackageVersioned, fetch, refetch } = installedPackagesStore;
  const [operatingOn, setOperatingOn] = createSignal<string | null>(null);
  const [scoopStatus, setScoopStatus] = createSignal<ScoopStatus | null>(null);
  const [statusLoading, setStatusLoading] = createSignal(false);
  const [statusError, setStatusError] = createSignal<string | null>(null);

  // Use shared hooks
  const packageOperations = usePackageOperations();
  const packageInfo = usePackageInfo();
  
  // State for auto-showing versions in modal
  const [autoShowVersions, setAutoShowVersions] = createSignal(false);
  
  const [viewMode, setViewMode] = createStoredSignal<'grid' | 'list'>('installedViewMode', 'grid');
  const [sortKey, setSortKey] = createStoredSignal<SortKey>('installedSortKey', 'name');
  const [sortDirection, setSortDirection] = createStoredSignal<'asc' | 'desc'>('installedSortDirection', 'asc');
  const [selectedBucket, setSelectedBucket] = createStoredSignal<string>('installedSelectedBucket', 'all');
  
  onMount(fetch);

  const checkForUpdates = () => {
    installedPackagesStore.checkForUpdates();
  };

  const checkScoopStatus = async () => {
    setStatusLoading(true);
    setStatusError(null);
    try {
      // First refresh the packages list to catch any CLI installations
      await refetch();
      const status = await invoke<ScoopStatus>("check_scoop_status");
      setScoopStatus(status);
    } catch (err) {
      console.error("Failed to check scoop status:", err);
      setStatusError(err as string);
    } finally {
      setStatusLoading(false);
    }
  };

  const fetchInstalledPackages = () => {
    refetch();
  }

  const handleFetchPackageInfoForVersions = (pkg: ScoopPackage) => {
    setAutoShowVersions(true);
    packageInfo.fetchPackageInfo(pkg);
  }

  const handleFetchPackageInfo = (pkg: ScoopPackage) => {
    setAutoShowVersions(false);
    packageInfo.fetchPackageInfo(pkg);
  }

  const handleCloseInfoModalWithVersions = () => {
    setAutoShowVersions(false);
    packageInfo.closeModal();
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

  const handleSwitchVersion = async (pkgName: string, version: string) => {
    setOperatingOn(pkgName);
    try {
      await invoke("switch_package_version", {
        packageName: pkgName,
        targetVersion: version,
        global: false, // TODO: Add support for global packages
      });
    } catch (err) {
      console.error(`Failed to switch package ${pkgName} to version ${version}:`, err);
    } finally {
      // Refresh packages list to reflect any changes
      await refetch();
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
        const aHasUpdate = !!a.available_version && !heldStore.isHeld(a.name) && !a.is_versioned_install;
        const bHasUpdate = !!b.available_version && !heldStore.isHeld(b.name) && !b.is_versioned_install;
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

  const updatableCount = () => packages().filter(p => !!p.available_version && !heldStore.isHeld(p.name) && !p.is_versioned_install).length;

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
    isPackageVersioned,
    autoShowVersions,
    
    // Status functionality
    scoopStatus,
    statusLoading,
    statusError,
    checkScoopStatus,
    
    // From usePackageInfo
    selectedPackage: packageInfo.selectedPackage,
    info: packageInfo.info,
    infoLoading: packageInfo.loading,
    infoError: packageInfo.error,
    handleFetchPackageInfo,
    handleFetchPackageInfoForVersions,
    handleCloseInfoModal: packageInfo.closeModal,
    handleCloseInfoModalWithVersions,
    
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
    handleSwitchVersion,
    fetchInstalledPackages,
    checkForUpdates,
  };
} 
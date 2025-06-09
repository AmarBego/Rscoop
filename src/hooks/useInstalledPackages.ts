import { createSignal, onMount, createMemo } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { ScoopPackage, ScoopInfo, UpdatablePackage } from "../types/scoop";
import { createStoredSignal } from "./createStoredSignal";
import heldStore from "../stores/held";

type SortKey = 'name' | 'version' | 'source' | 'updated';

export interface DisplayPackage extends ScoopPackage {
  available_version?: string;
}

interface OperationNextStep {
  buttonLabel: string;
  onNext: () => void;
}

export function useInstalledPackages() {
  const [packages, setPackages] = createSignal<DisplayPackage[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  // Modal states
  const [selectedPackage, setSelectedPackage] = createSignal<ScoopPackage | null>(null);
  const [info, setInfo] = createSignal<ScoopInfo | null>(null);
  const [infoLoading, setInfoLoading] = createSignal(false);
  const [infoError, setInfoError] = createSignal<string | null>(null);
  const [operationTitle, setOperationTitle] = createSignal<string | null>(null);
  const [operationNextStep, setOperationNextStep] = createSignal<OperationNextStep | null>(null);

  // View and sort state with persistence from localStorage via custom hook
  const [viewMode, setViewMode] = createStoredSignal<'grid' | 'list'>('installedViewMode', 'grid');
  const [sortKey, setSortKey] = createStoredSignal<SortKey>('installedSortKey', 'name');
  const [sortDirection, setSortDirection] = createStoredSignal<'asc' | 'desc'>('installedSortDirection', 'asc');
  const [selectedBucket, setSelectedBucket] = createStoredSignal<string>('installedSelectedBucket', 'all');
  
  const [uniqueBuckets, setUniqueBuckets] = createSignal<string[]>(['all']);
  const [isCheckingForUpdates, setIsCheckingForUpdates] = createSignal(false);

  // --- Data Fetching and Processing ---

  const checkForUpdates = async () => {
    setIsCheckingForUpdates(true);
    try {
      // The `check_for_updates` command in Rust already respects held packages.
      const updatable = await invoke<UpdatablePackage[]>("check_for_updates");
      const updatableMap = new Map(updatable.map(p => [p.name, p.available]));

      setPackages(pkgs => pkgs.map(p => ({
        ...p,
        available_version: updatableMap.get(p.name)
      })));
    } catch (err) {
      console.error("Failed to check for updates:", err);
    } finally {
      setIsCheckingForUpdates(false);
    }
  };

  const fetchInstalledPackages = async () => {
    setLoading(true);
    setError(null);
    try {
      const installedPackages = await invoke<ScoopPackage[]>("get_installed_packages_full");
      setPackages(installedPackages);
      const buckets = new Set<string>(installedPackages.map(p => p.source));
      setUniqueBuckets(['all', ...Array.from(buckets).sort()]);
      // Concurrently fetch held packages and check for updates
      await Promise.all([
        heldStore.refetch(),
        checkForUpdates()
      ]);
    } catch (err) {
      console.error("Failed to fetch installed packages:", err);
      setError("Failed to load installed packages");
      setPackages([]);
    } finally {
      setLoading(false);
    }
  };

  onMount(fetchInstalledPackages);

  // --- Handlers ---

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
    // No longer need to pass ignored packages, the backend `scoop update` command handles it.
    invoke("update_all_packages").catch(err => {
      console.error("Update all invocation failed:", err);
    });
  };

  const handleUninstall = (pkg: ScoopPackage) => {
    // Close the info modal if it's open for the package being uninstalled
    if (selectedPackage()?.name === pkg.name) {
      handleCloseInfoModal();
    }

    setOperationTitle(`Uninstalling ${pkg.name}`);
    setOperationNextStep({
      buttonLabel: "Clear Cache",
      onNext: () => {
        setOperationTitle(`Clearing cache for ${pkg.name}`);
        setOperationNextStep(null); // No next step after clearing cache
        invoke("clear_package_cache", {
          packageName: pkg.name,
          packageSource: pkg.source,
        }).catch(err => console.error("Clear cache invocation failed:", err));
      },
    });

    invoke("uninstall_package", {
      packageName: pkg.name,
      packageSource: pkg.source,
    }).catch(err => {
      console.error("Uninstall invocation failed:", err);
      // If the initial uninstall fails, don't show the "Clear Cache" button
      setOperationNextStep(null);
    });
  };

  const handleHold = (pkgName: string) => {
    setOperationTitle(`Placing a hold on ${pkgName}...`);
    invoke("hold_package", { packageName: pkgName }).finally(() => {
      heldStore.refetch();
    });
  };

  const handleUnhold = (pkgName: string) => {
    setOperationTitle(`Removing hold from ${pkgName}...`);
    invoke("unhold_package", { packageName: pkgName }).finally(() => {
      heldStore.refetch();
    });
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

  // --- Derived State (Memoized Computations) ---

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
    // State
    loading,
    error,
    packages,
    uniqueBuckets,
    isCheckingForUpdates,
    // Derived State
    processedPackages,
    updatableCount,
    // View/Sort/Filter State & Setters
    viewMode, setViewMode,
    sortKey, sortDirection,
    selectedBucket, setSelectedBucket,
    // Modal State
    selectedPackage, info, infoLoading, infoError,
    operationTitle,
    operationNextStep,
    // Handlers
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
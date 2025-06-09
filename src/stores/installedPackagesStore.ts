import { createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { ScoopPackage, UpdatablePackage } from "../types/scoop";
import heldStore from "./held";

export interface DisplayPackage extends ScoopPackage {
  available_version?: string;
}

const [packages, setPackages] = createSignal<DisplayPackage[]>([]);
const [loading, setLoading] = createSignal(false);
const [error, setError] = createSignal<string | null>(null);
const [uniqueBuckets, setUniqueBuckets] = createSignal<string[]>(['all']);
const [isLoaded, setIsLoaded] = createSignal(false);
const [isCheckingForUpdates, setIsCheckingForUpdates] = createSignal(false);

const checkForUpdates = async () => {
  setIsCheckingForUpdates(true);
  try {
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
  if (isLoaded() || loading()) {
    return;
  }

  setLoading(true);
  setError(null);
  try {
    const installedPackages = await invoke<ScoopPackage[]>("get_installed_packages_full");
    setPackages(installedPackages);
    const buckets = new Set<string>(installedPackages.map(p => p.source));
    setUniqueBuckets(['all', ...Array.from(buckets).sort()]);
    setIsLoaded(true);

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

const refetch = () => {
    setIsLoaded(false);
    fetchInstalledPackages();
}

const installedPackagesStore = {
  packages,
  loading,
  error,
  uniqueBuckets,
  isLoaded,
  isCheckingForUpdates,
  fetch: fetchInstalledPackages,
  refetch,
  checkForUpdates,
};

export default installedPackagesStore; 
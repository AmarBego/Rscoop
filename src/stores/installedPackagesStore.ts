import { createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { ScoopPackage, UpdatablePackage } from "../types/scoop";
import heldStore from "./held";
import { getErrorMessage } from "../utils/errors";

export interface DisplayPackage extends ScoopPackage {
  available_version?: string;
}

const [packages, setPackages] = createSignal<DisplayPackage[]>([]);
const [loading, setLoading] = createSignal(false);
const [error, setError] = createSignal<string | null>(null);
const [uniqueBuckets, setUniqueBuckets] = createSignal<string[]>(['all']);
const [isLoaded, setIsLoaded] = createSignal(false);
const [isCheckingForUpdates, setIsCheckingForUpdates] = createSignal(false);
const [versionedPackages, setVersionedPackages] = createSignal<string[]>([]);

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
    console.error("Failed to check for updates:", getErrorMessage(err));
  } finally {
    setIsCheckingForUpdates(false);
  }
};

const fetchVersionedPackages = async () => {
  try {
    const versioned = await invoke<string[]>("get_versioned_packages", {
      global: false, // TODO: Add support for global packages
    });
    setVersionedPackages(versioned);
  } catch (err) {
    console.error("Failed to fetch versioned packages:", getErrorMessage(err));
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
      checkForUpdates(),
      fetchVersionedPackages()
    ]);
  } catch (err) {
    const errorMsg = getErrorMessage(err, "Failed to load installed packages");
    console.error("Failed to fetch installed packages:", errorMsg);
    setError(errorMsg);
    setPackages([]);
  } finally {
    setLoading(false);
  }
};

const reload = async () => {
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
      checkForUpdates(),
      fetchVersionedPackages()
    ]);
  } catch (err) {
    const errorMsg = getErrorMessage(err, "Failed to reload installed packages");
    console.error("Failed to reload installed packages:", errorMsg);
    setError(errorMsg);
    setPackages([]);
  } finally {
    setLoading(false);
  }
};

const refetch = async () => {
  setIsLoaded(false);
  setLoading(true);
  setError(null);
  try {
    const installedPackages = await invoke<ScoopPackage[]>("refresh_installed_packages");
    setPackages(installedPackages);
    const buckets = new Set<string>(installedPackages.map(p => p.source));
    setUniqueBuckets(['all', ...Array.from(buckets).sort()]);
    setIsLoaded(true);

    await Promise.all([
      heldStore.refetch(),
      checkForUpdates(),
      fetchVersionedPackages()
    ]);
  } catch (err) {
    const errorMsg = getErrorMessage(err, "Failed to refresh installed packages");
    console.error("Failed to refresh installed packages:", errorMsg);
    setError(errorMsg);
    setPackages([]);
  } finally {
    setLoading(false);
  }
}

const isPackageVersioned = (packageName: string) => {
  return versionedPackages().includes(packageName);
};

const installedPackagesStore = {
  packages,
  loading,
  error,
  uniqueBuckets,
  isLoaded,
  isCheckingForUpdates,
  versionedPackages,
  isPackageVersioned,
  fetch: fetchInstalledPackages,
  reload,
  refetch,
  checkForUpdates,
  fetchVersionedPackages,
};

export default installedPackagesStore;

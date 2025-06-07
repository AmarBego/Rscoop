import { createSignal, createEffect, For, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { ScoopPackage, ScoopInfo } from "../types/scoop";
import PackageInfoModal from "../components/PackageInfoModal";

function InstalledPage() {
  const [packages, setPackages] = createSignal<ScoopPackage[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  // For the package info modal
  const [selectedPackage, setSelectedPackage] = createSignal<ScoopPackage | null>(null);
  const [info, setInfo] = createSignal<ScoopInfo | null>(null);
  const [infoLoading, setInfoLoading] = createSignal(false);
  const [infoError, setInfoError] = createSignal<string | null>(null);
  const [viewMode, setViewMode] = createSignal<'grid' | 'list'>('grid');

  const fetchInstalledPackages = async () => {
    setLoading(true);
    setError(null);
    try {
      const installedPackages = await invoke<ScoopPackage[]>("get_installed_packages_full");
      setPackages(installedPackages);
    } catch (err) {
      console.error("Failed to fetch installed packages:", err);
      setError("Failed to load installed packages");
      setPackages([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchPackageInfo = async (pkg: ScoopPackage) => {
    if (selectedPackage()?.name === pkg.name) {
      closeModal();
      return;
    }
    
    setSelectedPackage(pkg);
    setInfoLoading(true);
    setInfoError(null);
    setInfo(null);
    
    try {
        const result = await invoke<ScoopInfo>("get_package_info", {
            packageName: pkg.name
        });
        setInfo(result);
    } catch (err) {
      console.error(`Failed to fetch info for ${pkg.name}:`, err);
      setInfoError(`Failed to load info for ${pkg.name}`);
    } finally {
      setInfoLoading(false);
    }
  };

  const closeModal = () => {
    setSelectedPackage(null);
    setInfo(null);
    setInfoError(null);
  };

  createEffect(() => {
    fetchInstalledPackages();
  });

  return (
    <div class="p-4 sm:p-6 md:p-8">
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-3xl font-bold tracking-tight">Installed Packages</h2>
        <div class="flex items-center gap-4">
          <button 
            class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-300 dark:focus:ring-blue-800 disabled:opacity-50"
            onClick={fetchInstalledPackages}
            disabled={loading()}
          >
            Refresh
          </button>
          <div class="bg-gray-200 dark:bg-gray-700 p-1 rounded-lg flex items-center">
            <button 
              classList={{ 
                'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400': viewMode() === 'list',
                'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600': viewMode() !== 'list'
              }}
              class="px-3 py-1 text-sm font-medium rounded-md"
              onClick={() => setViewMode('list')}
            >
              List
            </button>
            <button 
              classList={{ 
                'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400': viewMode() === 'grid',
                'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600': viewMode() !== 'grid'
              }}
              class="px-3 py-1 text-sm font-medium rounded-md"
              onClick={() => setViewMode('grid')}
            >
              Grid
            </button>
          </div>
        </div>
      </div>

      <Show when={loading()}>
        <div class="flex justify-center items-center h-64">
            <div class="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      </Show>
      
      <Show when={error()}>
        <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative" role="alert">
          <strong class="font-bold">Error:</strong>
          <span class="block sm:inline"> {error()}</span>
          <button class="mt-2 sm:mt-0 sm:ml-4 px-4 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700" onClick={fetchInstalledPackages}>Try Again</button>
        </div>
      </Show>

      <Show when={!loading() && !error() && packages().length === 0}>
        <div class="text-center py-16">
          <p class="text-xl text-gray-500 dark:text-gray-400">No packages installed via Scoop</p>
        </div>
      </Show>

      <Show when={!loading() && !error() && packages().length > 0}>
        <Show when={viewMode() === 'list'}>
          <div class="overflow-x-auto bg-white dark:bg-gray-800 rounded-lg shadow">
            <table class="w-full text-sm text-left text-gray-500 dark:text-gray-400">
              <thead class="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                <tr>
                  <th scope="col" class="px-6 py-3">Name</th>
                  <th scope="col" class="px-6 py-3">Version</th>
                  <th scope="col" class="px-6 py-3">Source</th>
                  <th scope="col" class="px-6 py-3">Updated</th>
                  <th scope="col" class="px-6 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                <For each={packages()}>
                  {(pkg) => (
                    <tr class="bg-white dark:bg-gray-800 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">
                      <th scope="row" class="px-6 py-4 font-medium text-gray-900 whitespace-nowrap dark:text-white">
                        <button class="hover:underline" onClick={() => fetchPackageInfo(pkg)}>
                          {pkg.name}
                        </button>
                      </th>
                      <td class="px-6 py-4">{pkg.version}</td>
                      <td class="px-6 py-4">{pkg.source}</td>
                      <td class="px-6 py-4">{pkg.updated}</td>
                      <td class="px-6 py-4">
                        <div class="flex justify-center items-center gap-2">
                          <button class="font-medium text-blue-600 dark:text-blue-500 hover:underline">Update</button>
                          <button class="font-medium text-red-600 dark:text-red-500 hover:underline">Uninstall</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
        <Show when={viewMode() === 'grid'}>
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            <For each={packages()}>
              {(pkg) => (
                <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-5 flex flex-col justify-between transition-transform transform hover:scale-105">
                  <div>
                    <button class="text-lg font-bold text-gray-900 dark:text-white hover:underline" onClick={() => fetchPackageInfo(pkg)}>
                      {pkg.name}
                    </button>
                    <div class="text-sm text-gray-500 dark:text-gray-400 mt-2">Version: {pkg.version}</div>
                    <div class="text-sm text-gray-500 dark:text-gray-400">Source: {pkg.source}</div>
                    <div class="text-sm text-gray-500 dark:text-gray-400">Updated: {pkg.updated}</div>
                  </div>
                  <div class="flex justify-end gap-2 mt-4">
                    <button class="text-sm font-medium text-blue-600 dark:text-blue-500 hover:underline">Update</button>
                    <button class="text-sm font-medium text-red-600 dark:text-red-500 hover:underline">Uninstall</button>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>

      <PackageInfoModal 
        pkg={selectedPackage()}
        info={info()}
        loading={infoLoading()}
        error={infoError()}
        onClose={closeModal}
      />
    </div>
  );
}

export default InstalledPage; 
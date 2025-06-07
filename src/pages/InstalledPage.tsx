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
        <h2 class="text-3xl font-bold tracking-tight text-[#EDEDED]">Installed Packages</h2>
        <div class="flex items-center gap-4">
          <button 
            class="px-4 py-2 text-sm font-medium text-[#EDEDED] bg-[#3B82F6] rounded-xl hover:bg-[#60A5FA] focus:ring-4 focus:ring-[#3B82F6]/50 disabled:opacity-50 transition-all duration-200"
            onClick={fetchInstalledPackages}
            disabled={loading()}
          >
            Refresh
          </button>
          <div class="bg-[#2A2A2A]/50 p-1 rounded-xl flex items-center">
            <button 
              classList={{ 
                'bg-[#2A2A2A] text-[#3B82F6]': viewMode() === 'list',
                'text-[#A1A1AA] hover:bg-[#3A3A3A]/50': viewMode() !== 'list'
              }}
              class="px-3 py-1 text-sm font-medium rounded-xl transition-all duration-200"
              onClick={() => setViewMode('list')}
            >
              List
            </button>
            <button 
              classList={{ 
                'bg-[#2A2A2A] text-[#3B82F6]': viewMode() === 'grid',
                'text-[#A1A1AA] hover:bg-[#3A3A3A]/50': viewMode() !== 'grid'
              }}
              class="px-3 py-1 text-sm font-medium rounded-xl transition-all duration-200"
              onClick={() => setViewMode('grid')}
            >
              Grid
            </button>
          </div>
        </div>
      </div>

      <Show when={loading()}>
        <div class="flex justify-center items-center h-64">
            <div class="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-[#3B82F6]"></div>
        </div>
      </Show>
      
      <Show when={error()}>
        <div class="bg-[#EF4444]/20 border border-[#EF4444]/50 text-[#EF4444] px-4 py-3 rounded-xl relative" role="alert">
          <strong class="font-bold">Error:</strong>
          <span class="block sm:inline"> {error()}</span>
          <button class="mt-2 sm:mt-0 sm:ml-4 px-4 py-2 bg-[#EF4444] text-[#EDEDED] font-bold rounded-xl hover:bg-[#EF4444]/80" onClick={fetchInstalledPackages}>Try Again</button>
        </div>
      </Show>

      <Show when={!loading() && !error() && packages().length === 0}>
        <div class="text-center py-16">
          <p class="text-xl text-[#A1A1AA]">No packages installed via Scoop</p>
        </div>
      </Show>

      <Show when={!loading() && !error() && packages().length > 0}>
        <Show when={viewMode() === 'list'}>
          <div class="overflow-x-auto bg-[#2A2A2A] rounded-xl shadow-xl shadow-black/30">
            <table class="w-full text-sm text-left text-[#A1A1AA]">
              <thead class="text-xs text-[#D4D4D8] uppercase bg-[#3A3A3A]/50">
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
                    <tr class="bg-[#2A2A2A] border-b border-[#4B4B4B] hover:bg-[#3A3A3A]/50">
                      <th scope="row" class="px-6 py-4 font-medium text-[#EDEDED] whitespace-nowrap">
                        <button class="hover:underline" onClick={() => fetchPackageInfo(pkg)}>
                          {pkg.name}
                        </button>
                      </th>
                      <td class="px-6 py-4">{pkg.version}</td>
                      <td class="px-6 py-4">{pkg.source}</td>
                      <td class="px-6 py-4">{pkg.updated}</td>
                      <td class="px-6 py-4">
                        <div class="flex justify-center items-center gap-2">
                          <button class="px-3 py-1 text-xs font-medium bg-[#3B82F6] text-[#EDEDED] rounded-full hover:bg-[#60A5FA] transition-all duration-200">Update</button>
                          <button class="px-3 py-1 text-xs font-medium bg-[#EF4444] text-[#EDEDED] rounded-full hover:bg-[#EF4444]/80 transition-all duration-200">Uninstall</button>
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
                <div class="bg-[#2A2A2A] rounded-xl shadow-xl shadow-black/30 p-5 flex flex-col justify-between transition-transform transform hover:scale-105">
                  <div>
                    <button class="text-lg font-bold text-[#EDEDED] hover:underline" onClick={() => fetchPackageInfo(pkg)}>
                      {pkg.name}
                    </button>
                    <div class="text-sm text-[#A1A1AA] mt-2">Version: {pkg.version}</div>
                    <div class="text-sm text-[#A1A1AA]">Source: {pkg.source}</div>
                    <div class="text-sm text-[#A1A1AA]">Updated: {pkg.updated}</div>
                  </div>
                  <div class="flex justify-end gap-2 mt-4">
                    <button class="px-3 py-1 text-xs font-medium bg-[#3B82F6] text-[#EDEDED] rounded-full hover:bg-[#60A5FA] transition-all duration-200">Update</button>
                    <button class="px-3 py-1 text-xs font-medium bg-[#EF4444] text-[#EDEDED] rounded-full hover:bg-[#EF4444]/80 transition-all duration-200">Uninstall</button>
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
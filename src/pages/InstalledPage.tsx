import { createSignal, createEffect, For, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { ScoopPackage, ScoopInfo } from "../types/scoop";
import PackageInfoModal from "../components/PackageInfoModal";
import { MoreHorizontal, ArrowUpCircle, Trash2 } from 'lucide-solid';

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
            class="btn btn-primary"
            onClick={fetchInstalledPackages}
            disabled={loading()}
          >
            Refresh
          </button>
          <div class="tabs tabs-border">
            <a 
              class="tab"
              classList={{ "tab-active": viewMode() === 'list' }}
              onClick={() => setViewMode('list')}
            >
              List
            </a>
            <a 
              class="tab"
              classList={{ "tab-active": viewMode() === 'grid' }}
              onClick={() => setViewMode('grid')}
            >
              Grid
            </a>
          </div>
        </div>
      </div>

      <Show when={loading()}>
        <div class="flex justify-center items-center h-64">
          <span class="loading loading-spinner loading-lg"></span>
        </div>
      </Show>
      
      <Show when={error()}>
        <div role="alert" class="alert alert-error">
          <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span>Error: {error()}</span>
          <button class="btn btn-sm btn-primary" onClick={fetchInstalledPackages}>Try Again</button>
        </div>
      </Show>

      <Show when={!loading() && !error() && packages().length === 0}>
        <div class="text-center py-16">
          <p class="text-xl">No packages installed via Scoop</p>
        </div>
      </Show>

      <Show when={!loading() && !error() && packages().length > 0}>
        <Show when={viewMode() === 'list'}>
          <div class="overflow-x-auto bg-base-200 rounded-xl shadow-xl">
            <table class="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Version</th>
                  <th>Source</th>
                  <th>Updated</th>
                  <th class="text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                <For each={packages()}>
                  {(pkg) => (
                    <tr>
                      <td>
                        <button class="btn btn-ghost btn-sm" onClick={() => fetchPackageInfo(pkg)}>
                          {pkg.name}
                        </button>
                      </td>
                      <td>{pkg.version}</td>
                      <td>{pkg.source}</td>
                      <td title={pkg.updated}>{pkg.updated.split(" ")[0]}</td>
                      <td class="text-center">
                        <div class="dropdown dropdown-end">
                          <label tabindex="0" class="btn btn-ghost btn-xs btn-circle">
                            <MoreHorizontal class="w-4 h-4" />
                          </label>
                          <ul tabindex="0" class="dropdown-content menu p-2 shadow bg-base-100 rounded-box w-40 z-[1]">
                            <li>
                              <a>
                                <ArrowUpCircle class="w-4 h-4 mr-2" />
                                Update
                              </a>
                            </li>
                            <li>
                              <a class="text-error">
                                <Trash2 class="w-4 h-4 mr-2" />
                                Uninstall
                              </a>
                            </li>
                          </ul>
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
                <div class="card bg-base-200 shadow-xl transition-transform transform hover:scale-101">
                  <div class="card-body">
                    <div class="flex justify-between items-start mb-2">
                      <h2 class="card-title">
                        <button class="hover:underline" onClick={() => fetchPackageInfo(pkg)}>
                          {pkg.name}
                        </button>
                      </h2>
                      <div class="dropdown dropdown-end">
                        <label tabindex="0" class="btn btn-ghost btn-sm btn-circle">
                          <MoreHorizontal class="w-5 h-5" />
                        </label>
                        <ul tabindex="0" class="dropdown-content menu p-2 shadow bg-base-100 rounded-box w-40 z-[1]">
                          <li>
                            <a>
                              <ArrowUpCircle class="w-4 h-4 mr-2" />
                              Update
                            </a>
                          </li>
                          <li>
                            <a class="text-error">
                              <Trash2 class="w-4 h-4 mr-2" />
                              Uninstall
                            </a>
                          </li>
                        </ul>
                      </div>
                    </div>
                    
                    <p class="text-sm">Version: {pkg.version}</p>
                    <p class="text-sm">Source: {pkg.source}</p>
                    <p class="text-sm" title={pkg.updated}>Updated: {pkg.updated.split(" ")[0]}</p>
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
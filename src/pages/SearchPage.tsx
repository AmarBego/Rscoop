import { createSignal, createEffect, on, For, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { ScoopPackage, ScoopInfo } from "../types/scoop";
import PackageInfoModal from "../components/PackageInfoModal";
import OperationModal from "../components/OperationModal";
import { Download } from "lucide-solid";
import settingsStore from "../stores/settings";
import installedPackagesStore from "../stores/installedPackagesStore";

interface OperationNextStep {
  buttonLabel: string;
  onNext: () => void;
}

function SearchPage() {
  const [searchTerm, setSearchTerm] = createSignal("");
  const [results, setResults] = createSignal<ScoopPackage[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [activeTab, setActiveTab] = createSignal<"packages" | "includes">(
    "packages"
  );

  // For the package info modal
  const [selectedPackage, setSelectedPackage] =
    createSignal<ScoopPackage | null>(null);
  const [info, setInfo] = createSignal<ScoopInfo | null>(null);
  const [infoLoading, setInfoLoading] = createSignal(false);
  const [infoError, setInfoError] = createSignal<string | null>(null);

  // For OperationModal
  const [operationTitle, setOperationTitle] = createSignal<string | null>(null);
  const [operationNextStep, setOperationNextStep] =
    createSignal<OperationNextStep | null>(null);
  const { settings } = settingsStore;
  const [isScanning, setIsScanning] = createSignal(false);
  const [pendingInstallPackage, setPendingInstallPackage] =
    createSignal<ScoopPackage | null>(null);

  let debounceTimer: number;

  const handleSearch = async (term: string) => {
    if (term.length < 2 && term.length !== 0) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await invoke<ScoopPackage[]>("search_scoop", { term });
      setResults(res);
    } catch (error) {
      console.error("Search failed:", error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const performInstall = (pkg: ScoopPackage) => {
    setOperationTitle(`Installing ${pkg.name}`);
    setIsScanning(false);
    invoke("install_package", {
      packageName: pkg.name,
      packageSource: pkg.source,
    }).catch((err) => {
      console.error("Installation invocation failed:", err);
    });
  };

  const handleInstall = (pkg: ScoopPackage) => {
    if (selectedPackage()?.name === pkg.name) {
      closeModal();
    }

    if (settings.virustotal.enabled && settings.virustotal.autoScanOnInstall) {
      setOperationTitle(`Scanning ${pkg.name} with VirusTotal...`);
      setIsScanning(true);
      setPendingInstallPackage(pkg); // Remember which package to install
      invoke("scan_package", {
        packageName: pkg.name,
        packageSource: pkg.source,
      }).catch((err) => {
        console.error("Scan invocation failed:", err);
      });
    } else {
      performInstall(pkg);
    }
  };

  const handleInstallConfirm = () => {
    const pkg = pendingInstallPackage();
    if (pkg) {
      performInstall(pkg);
      setPendingInstallPackage(null);
    }
  };

  const handleUninstall = (pkg: ScoopPackage) => {
    if (selectedPackage()?.name === pkg.name) {
      closeModal();
    }
    setOperationTitle(`Uninstalling ${pkg.name}`);
    setOperationNextStep({
      buttonLabel: "Clear Cache",
      onNext: () => {
        setOperationTitle(`Clearing cache for ${pkg.name}`);
        setOperationNextStep(null);
        invoke("clear_package_cache", {
          packageName: pkg.name,
          packageSource: pkg.source,
        }).catch((err) => console.error("Clear cache invocation failed:", err));
      },
    });

    invoke("uninstall_package", {
      packageName: pkg.name,
      packageSource: pkg.source,
    }).catch((err) => {
      console.error(`Uninstallation invocation failed for ${pkg.name}:`, err);
      setOperationNextStep(null);
    });
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
        packageName: pkg.name,
      });
      setInfo(result);
    } catch (err) {
      console.error(`Failed to fetch info for ${pkg.name}:`, err);
      setInfoError(`Failed to load info for ${pkg.name}`);
    } finally {
      setInfoLoading(false);
    }
  };

  const closeOperationModal = (wasSuccess: boolean) => {
    setOperationTitle(null);
    setIsScanning(false);
    setPendingInstallPackage(null);
    setOperationNextStep(null);
    if (wasSuccess) {
      // Refetch search to update "installed" status
      handleSearch(searchTerm());
      // Refetch installed packages list in the background
      installedPackagesStore.refetch();
    }
  };

  const closeModal = () => {
    setSelectedPackage(null);
    setInfo(null);
    setInfoError(null);
  };

  createEffect(
    on(searchTerm, (term) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => handleSearch(term), 300);
    })
  );

  const packageResults = () =>
    results().filter((p) => p.match_source === "Name");
  const binaryResults = () =>
    results().filter((p) => p.match_source === "Binary");
  const resultsToShow = () => {
    return activeTab() === "packages" ? packageResults() : binaryResults();
  };

  return (
    <div class="p-4 sm:p-6 md:p-8">
      <div class="max-w-3xl mx-auto">
        <div class="relative">
          <input
            type="text"
            placeholder="Search for apps..."
            class="input input-bordered w-full"
            value={searchTerm()}
            onInput={(e) => setSearchTerm(e.currentTarget.value)}
          />
        </div>

        <div class="tabs tabs-border my-6">
          <a
            class="tab"
            classList={{ "tab-active": activeTab() === "packages" }}
            onClick={() => setActiveTab("packages")}
          >
            Packages ({packageResults().length})
          </a>
          <a
            class="tab"
            classList={{ "tab-active": activeTab() === "includes" }}
            onClick={() => setActiveTab("includes")}
          >
            Includes ({binaryResults().length})
          </a>
        </div>

        <Show when={loading()}>
          <div class="flex justify-center items-center h-64">
            <span class="loading loading-spinner loading-lg"></span>
          </div>
        </Show>

        <Show
          when={!loading() && resultsToShow().length === 0 && searchTerm().length > 1}
        >
          <div class="text-center py-16">
            <p class="text-xl">
              No {activeTab() === "packages" ? "packages" : "includes"} found
              for "{searchTerm()}"
            </p>
          </div>
        </Show>

        <div class="space-y-4">
          <For each={resultsToShow()}>
            {(pkg) => (
              <div
                class="card bg-base-200 shadow-xl cursor-pointer transition-all duration-200 transform hover:scale-101"
                onClick={() => fetchPackageInfo(pkg)}
              >
                <div class="card-body">
                  <div class="flex justify-between items-start">
                    <div class="flex-grow">
                      <h3 class="card-title">{pkg.name}</h3>
                      <p>
                        from bucket: <strong>{pkg.source}</strong>
                      </p>
                    </div>
                    <div class="flex-shrink-0 ml-4 text-right flex items-center gap-2">
                      <span class="badge badge-primary badge-soft">
                        {pkg.version}
                      </span>
                      {pkg.is_installed ? (
                        <span class="badge badge-success">Installed</span>
                      ) : (
                        <button
                          class="btn btn-sm btn-ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleInstall(pkg);
                          }}
                        >
                          <Download />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </For>
        </div>
      </div>

      <PackageInfoModal
        pkg={selectedPackage()}
        info={info()}
        loading={infoLoading()}
        error={infoError()}
        onClose={closeModal}
        onInstall={handleInstall}
        onUninstall={handleUninstall}
      />
      <OperationModal
        title={operationTitle()}
        onClose={closeOperationModal}
        isScan={isScanning()}
        onInstallConfirm={handleInstallConfirm}
        nextStep={operationNextStep() ?? undefined}
      />
    </div>
  );
}

export default SearchPage; 
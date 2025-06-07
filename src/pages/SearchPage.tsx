import { createSignal, createEffect, on, For, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { ScoopPackage, ScoopInfo } from "../types/scoop";
import PackageInfoModal from "../components/PackageInfoModal";

function SearchPage() {
  const [searchTerm, setSearchTerm] = createSignal("");
  const [results, setResults] = createSignal<ScoopPackage[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [activeTab, setActiveTab] = createSignal<"packages" | "includes">(
    "packages"
  );
  
  // For the package info modal
  const [selectedPackage, setSelectedPackage] = createSignal<ScoopPackage | null>(null);
  const [info, setInfo] = createSignal<ScoopInfo | null>(null);
  const [infoLoading, setInfoLoading] = createSignal(false);
  const [infoError, setInfoError] = createSignal<string | null>(null);
  
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

  createEffect(on(searchTerm, (term) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => handleSearch(term), 300);
  }));

  const packageResults = () => results().filter((p) => !p.info);
  const binaryResults = () => results().filter((p) => p.info);
  const resultsToShow = () => {
    return activeTab() === "packages" ? packageResults() : binaryResults();
  };

  return (
    <div class="p-4 sm:p-6 md:p-8">
      <div class="max-w-3xl mx-auto">
        <div class="relative">
          <input
            class="w-full pl-10 pr-4 py-3 text-lg bg-[#2A2A2A]/60 backdrop-blur-sm border border-[#4B4B4B] focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent text-[#EDEDED] placeholder-[#52525B] rounded-xl transition-all duration-200"
            type="text"
            placeholder="Search for apps..."
            value={searchTerm()}
            onInput={(e) => setSearchTerm(e.currentTarget.value)}
          />
          <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg class="w-5 h-5 text-[#A1A1AA]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>
        
        <div class="flex justify-center my-6 p-1 rounded-xl">
          <button
            class={`px-6 py-2 text-sm font-medium rounded-xl transition-all duration-200 ${activeTab() === "packages" ? "bg-[#2A2A2A] text-[#3B82F6] shadow-lg" : "text-[#A1A1AA] hover:bg-[#3A3A3A]/50"}`}
            onClick={() => setActiveTab("packages")}
          >
            Packages ({packageResults().length})
          </button>
          <button
            class={`px-6 py-2 text-sm font-medium rounded-xl transition-all duration-200 ${activeTab() === "includes" ? "bg-[#2A2A2A] text-[#3B82F6] shadow-lg" : "text-[#A1A1AA] hover:bg-[#3A3A3A]/50"}`}
            onClick={() => setActiveTab("includes")}
          >
            Includes ({binaryResults().length})
          </button>
        </div>
        
        <Show when={loading()}>
            <div class="flex justify-center items-center h-64">
                <div class="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-[#3B82F6]"></div>
            </div>
        </Show>
        
        <Show when={!loading() && resultsToShow().length === 0 && searchTerm().length > 1}>
          <div class="text-center py-16">
              <p class="text-xl text-[#A1A1AA]">No {activeTab() === "packages" ? "packages" : "includes"} found for "{searchTerm()}"</p>
          </div>
        </Show>

        <div class="space-y-4">
          <For each={resultsToShow()}>
            {(pkg) => (
              <div
                class="bg-[#2A2A2A] border border-[#4B4B4B] rounded-xl shadow-xl shadow-black/30 p-6 cursor-pointer transition-all duration-200 transform hover:shadow-2xl hover:scale-105"
                onClick={() => fetchPackageInfo(pkg)}
              >
                <div class="flex justify-between items-start">
                  <div class="flex-grow">
                    <h3 class="text-lg font-bold text-[#EDEDED]">{pkg.name}</h3>
                    <p class="text-sm text-[#A1A1AA]">
                      from bucket: <strong>{pkg.source}</strong>
                    </p>
                    {pkg.info && <p class="text-sm text-[#A1A1AA] mt-1">{pkg.info}</p>}
                  </div>
                  <div class="flex-shrink-0 ml-4 text-right flex items-center gap-2">
                    <span class="text-sm font-semibold text-[#3B82F6]">{pkg.version}</span>
                    {pkg.is_installed ? 
                      <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#22C55E]/20 text-[#22C55E]">Installed</span> :
                      <button class="text-xs font-medium bg-[#3B82F6] text-[#EDEDED] px-2.5 py-0.5 rounded-full hover:bg-[#60A5FA] transition-all duration-200">Install</button>
                    }
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
      />
    </div>
  );
}

export default SearchPage; 
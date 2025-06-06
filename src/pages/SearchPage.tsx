import { createSignal, createEffect, on, For } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { ScoopPackage } from "../types/scoop";
import "./SearchPage.css";

function SearchPage() {
  const [searchTerm, setSearchTerm] = createSignal("");
  const [results, setResults] = createSignal<ScoopPackage[]>([]);
  const [loading, setLoading] = createSignal(false);
  
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

  createEffect(on(searchTerm, (term) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => handleSearch(term), 300);
  }));

  return (
    <div class="search-page">
      <div class="search-container">
        <input
          class="search-input"
          type="text"
          placeholder="Search for apps..."
          value={searchTerm()}
          onInput={(e) => setSearchTerm(e.currentTarget.value)}
        />
      </div>
      
      {loading() && <div class="loader"></div>}
      
      {!loading() && results().length === 0 && searchTerm().length > 1 && (
         <div class="no-results">
            <p>No results found for "{searchTerm()}"</p>
         </div>
      )}

      <div class="results-container">
        <For each={results()}>
          {(pkg) => (
            <div class="result-item">
              <div class="item-header">
                <h3 class="item-name">{pkg.name}</h3>
                <span class="item-version">{pkg.version}</span>
              </div>
              <p class="item-source">
                from bucket: <strong>{pkg.source}</strong>
                {pkg.is_installed && <span class="installed-chip">Installed</span>}
              </p>
              {pkg.info && <p class="item-info">{pkg.info}</p>}
            </div>
          )}
        </For>
      </div>
    </div>
  );
}

export default SearchPage; 
import { createRoot } from "solid-js";
import { createStore, SetStoreFunction } from "solid-js/store";
import { invoke } from "@tauri-apps/api/core";

function createHeldPackagesStore() {
  const [store, setStore] = createStore<{
    packages: string[];
    isLoading: boolean;
    error: string | null;
  }>({
    packages: [],
    isLoading: true,
    error: null,
  });

  const fetchHeldPackages = async () => {
    setStore("isLoading", true);
    try {
      const heldPackages = await invoke<string[]>("list_held_packages");
      setStore("packages", heldPackages);
      setStore("error", null);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("Failed to fetch held packages:", errorMsg);
      setStore("error", "Could not load the list of held packages.");
    } finally {
      setStore("isLoading", false);
    }
  };
  
  const isHeld = (packageName: string) => {
    return store.packages.includes(packageName);
  }

  fetchHeldPackages();

  return { store, isHeld, refetch: fetchHeldPackages };
}

export default createRoot(createHeldPackagesStore); 
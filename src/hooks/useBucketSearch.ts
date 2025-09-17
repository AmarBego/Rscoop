import { createSignal, createResource, createEffect, on } from "solid-js";
import { invoke } from "@tauri-apps/api/core";

export interface SearchableBucket {
  name: string;
  full_name: string;
  description: string;
  url: string;
  stars: number;
  forks: number;
  apps: number;
  last_updated: string;
  is_verified: boolean;
}

export interface BucketSearchRequest {
  query?: string;
  include_expanded: boolean;
  max_results?: number;
  sort_by?: string;
  disable_chinese_buckets?: boolean;
  minimum_stars?: number;
}

export interface BucketSearchResponse {
  buckets: SearchableBucket[];
  total_count: number;
  is_expanded_search: boolean;
  expanded_list_size_mb?: number;
}

export interface ExpandedSearchInfo {
  estimated_size_mb: number;
  total_buckets: number;
  description: string;
}

export function useBucketSearch() {
  const [searchQuery, setSearchQuery] = createSignal<string>("");
  const [includeExpanded, setIncludeExpanded] = createSignal(false);
  const [sortBy, setSortBy] = createSignal<string>("stars"); // Default to stars instead of relevance
  const [maxResults, setMaxResults] = createSignal<number>(50);
  const [disableChineseBuckets, setDisableChineseBuckets] = createSignal(false);
  const [minimumStars, setMinimumStars] = createSignal(2);
  const [isSearching, setIsSearching] = createSignal(false);
  const [searchResults, setSearchResults] = createSignal<SearchableBucket[]>([]);
  const [totalCount, setTotalCount] = createSignal(0);
  const [isExpandedSearch, setIsExpandedSearch] = createSignal(false);
  const [expandedListSizeMb, setExpandedListSizeMb] = createSignal<number | undefined>(undefined);
  const [error, setError] = createSignal<string | null>(null);
  const [cacheExists, setCacheExists] = createSignal(false);

  // Check if cache exists on mount
  const checkCacheStatus = async () => {
    try {
      const exists = await invoke<boolean>("check_bucket_cache_exists");
      setCacheExists(exists);
      setIsExpandedSearch(exists);
      
      // IMPORTANT: If cache exists, we should be using expanded search
      if (exists) {
        setIncludeExpanded(true);
        console.log("Cache exists - automatically enabling expanded search");
      }
      
      return exists;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      return false;
    }
  };

  // Load default buckets on initialization
  const [defaultBuckets] = createResource(async () => {
    try {
      // First check if cache exists
      const cacheExistsStatus = await checkCacheStatus();
      
      if (cacheExistsStatus) {
        // If cache exists, load expanded results immediately with stars sorting
        console.log("Cache exists, loading expanded search results...");
        setIncludeExpanded(true); // Ensure expanded search is enabled
        const expandedResults = await searchBuckets(undefined, true, undefined, "stars");
        return expandedResults?.buckets || [];
      } else {
        // No cache, load default verified buckets (they should already be sorted by stars on backend)
        console.log("No cache, loading default buckets...");
        setIncludeExpanded(false); // Ensure we're in default mode
        const buckets = await invoke<SearchableBucket[]>("get_default_buckets");
        setSearchResults(buckets);
        setTotalCount(buckets.length);
        return buckets;
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      return [];
    }
  });

  // Get expanded search info
  const getExpandedSearchInfo = async (): Promise<ExpandedSearchInfo | null> => {
    try {
      return await invoke<ExpandedSearchInfo>("get_expanded_search_info");
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      return null;
    }
  };

  // Perform search
  const searchBuckets = async (
    query?: string,
    useExpanded?: boolean,
    maxRes?: number,
    sort?: string,
    disableChinese?: boolean,
    minStars?: number
  ) => {
    setIsSearching(true);
    setError(null);

    try {
      const request: BucketSearchRequest = {
        query: query || searchQuery(),
        include_expanded: useExpanded !== undefined ? useExpanded : includeExpanded(),
        max_results: maxRes || maxResults(),
        sort_by: sort || sortBy(),
        disable_chinese_buckets: disableChinese !== undefined ? disableChinese : disableChineseBuckets(),
        minimum_stars: minStars !== undefined ? minStars : minimumStars(),
      };

      const response = await invoke<BucketSearchResponse>("search_buckets", { request });
      
      setSearchResults(response.buckets);
      setTotalCount(response.total_count);
      setIsExpandedSearch(response.is_expanded_search);
      setExpandedListSizeMb(response.expanded_list_size_mb);
      
      // Update cache status if expanded search was performed
      if (response.is_expanded_search) {
        setCacheExists(true);
      }
      
      return response;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      return null;
    } finally {
      setIsSearching(false);
    }
  };

  // Clear search and return to defaults
  const clearSearch = async () => {
    setSearchQuery("");
    setError(null);
    const defaults = defaultBuckets();
    if (defaults) {
      setSearchResults(defaults);
      setTotalCount(defaults.length);
      setIsExpandedSearch(false);
      setExpandedListSizeMb(undefined);
    }
  };

  // Disable expanded search and clear cache
  const disableExpandedSearch = async (): Promise<boolean> => {
    try {
      await invoke("clear_bucket_cache");
      setIncludeExpanded(false);
      setIsExpandedSearch(false);
      setExpandedListSizeMb(undefined);
      setCacheExists(false);
      
      // Reload default buckets
      await loadDefaults();
      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      return false;
    }
  };

  // Load defaults explicitly (for when search is reopened)
  const loadDefaults = async () => {
    setError(null);
    setSortBy("stars"); // Ensure we're using stars sorting for defaults
    try {
      // Check if cache exists first
      const cacheExistsStatus = await checkCacheStatus();
      
      if (cacheExistsStatus) {
        // Cache exists, load expanded results and ensure we're in expanded mode
        console.log("Loading expanded results from cache...");
        setIncludeExpanded(true); // Ensure expanded search is enabled
        await searchBuckets(undefined, true, undefined, "stars"); // Explicit stars sorting
      } else {
        // No cache, load default verified buckets
        console.log("Loading default verified buckets...");
        setIncludeExpanded(false); // Ensure we're in default mode
        const buckets = await invoke<SearchableBucket[]>("get_default_buckets");
        setSearchResults(buckets);
        setTotalCount(buckets.length);
        setIsExpandedSearch(false);
        setExpandedListSizeMb(undefined);
        return buckets;
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      return [];
    }
  };

  // Debounced search effect like in useSearch.ts
  let debounceTimer: number;
  const handleSearch = async () => {
    if (searchQuery().trim() === "") {
      await clearSearch();
      return;
    }
    await searchBuckets(searchQuery());
  };

  createEffect(on(searchQuery, () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => handleSearch(), 300);
  }));

  return {
    // State
    searchQuery,
    setSearchQuery,
    includeExpanded,
    setIncludeExpanded,
    sortBy,
    setSortBy,
    maxResults,
    setMaxResults,
    disableChineseBuckets,
    setDisableChineseBuckets,
    minimumStars,
    setMinimumStars,
    
    // Results
    searchResults,
    totalCount,
    isExpandedSearch,
    expandedListSizeMb,
    isSearching,
    error,
    cacheExists,
    
    // Default buckets
    defaultBuckets,
    
    // Actions
    searchBuckets,
    clearSearch,
    loadDefaults,
    disableExpandedSearch,
    checkCacheStatus,
    getExpandedSearchInfo,
  };
}
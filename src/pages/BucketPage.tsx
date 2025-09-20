import { createSignal, onMount, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { useBuckets, type BucketInfo } from "../hooks/useBuckets";
import { usePackageInfo } from "../hooks/usePackageInfo";
import { usePackageOperations } from "../hooks/usePackageOperations";
import { ScoopPackage } from "../types/scoop";
import BucketInfoModal from "../components/BucketInfoModal";
import PackageInfoModal from "../components/PackageInfoModal";
import OperationModal from "../components/OperationModal";
import BucketSearch from "../components/page/buckets/BucketSearch";
import BucketGrid from "../components/page/buckets/BucketGrid";
import BucketSearchResults from "../components/page/buckets/BucketSearchResults";
import { SearchableBucket } from "../hooks/useBucketSearch";

interface BucketUpdateResult {
  success: boolean;
  message: string;
  bucket_name: string;
  bucket_path?: string;
  manifest_count?: number;
}

function BucketPage() {
  const { buckets, loading, error, fetchBuckets, getBucketManifests } = useBuckets();
  const packageInfo = usePackageInfo();
  const packageOperations = usePackageOperations();
  
  const [selectedBucket, setSelectedBucket] = createSignal<BucketInfo | null>(null);
  const [selectedBucketDescription, setSelectedBucketDescription] = createSignal<string | undefined>(undefined);
  const [manifests, setManifests] = createSignal<string[]>([]);
  const [manifestsLoading, setManifestsLoading] = createSignal(false);
  
  // Search state
  const [isSearchActive, setIsSearchActive] = createSignal(false);
  const [searchResults, setSearchResults] = createSignal<SearchableBucket[]>([]);
  const [searchTotalCount, setSearchTotalCount] = createSignal(0);
  const [searchLoading, setSearchLoading] = createSignal(false);
  const [searchError, setSearchError] = createSignal<string | null>(null);
  const [isExpandedSearch, setIsExpandedSearch] = createSignal(false);
  
  // Update state
  const [updatingBuckets, setUpdatingBuckets] = createSignal<Set<string>>(new Set());
  const [updateResults, setUpdateResults] = createSignal<{[key: string]: string}>({});

  onMount(() => {
    fetchBuckets();
  });

  const toggleSearch = () => {
    setIsSearchActive(!isSearchActive());
    if (!isSearchActive()) {
      // Reset search results when closing search
      setSearchResults([]);
      setSearchTotalCount(0);
      setSearchError(null);
      setIsExpandedSearch(false);
    }
  };

  const handleSearchResults = (results: any) => {
    setSearchResults(results.results || []);
    setSearchTotalCount(results.totalCount || 0);
    setSearchLoading(results.isSearching || false);
    setSearchError(results.error || null);
    setIsExpandedSearch(results.isExpandedSearch || false);
  };

  const handleViewBucket = async (bucket: BucketInfo) => {
    setSelectedBucket(bucket);
    setSelectedBucketDescription(undefined); // Clear description for regular buckets
    setManifestsLoading(true);
    const bucketManifests = await getBucketManifests(bucket.name);
    setManifests(bucketManifests);
    setManifestsLoading(false);
  };

  // Additional state for external bucket modal
  const [selectedSearchBucket, setSelectedSearchBucket] = createSignal<SearchableBucket | null>(null);

  const handleSearchBucketSelect = async (searchBucket: SearchableBucket) => {
    // First check if this bucket is already installed locally
    const installedBucket = buckets().find(b => b.name === searchBucket.name);
    
    if (installedBucket) {
      // Bucket is installed locally - use the regular handler to show manifests
      console.log(`Bucket "${searchBucket.name}" is installed locally, showing manifests...`);
      setSelectedSearchBucket(null); // Clear search bucket
      handleViewBucket(installedBucket);
    } else {
      // Bucket is not installed - show as external bucket with description
      console.log(`Bucket "${searchBucket.name}" is not installed, showing description...`);
      const bucketInfo: BucketInfo = {
        name: searchBucket.name,
        path: searchBucket.url, // Use URL as path for external buckets
        is_git_repo: true,
        git_url: searchBucket.url,
        git_branch: "main", // Default branch
        last_updated: searchBucket.last_updated,
        manifest_count: searchBucket.apps,
      };
      
      setSelectedBucket(bucketInfo);
      setSelectedSearchBucket(searchBucket); // Store the search bucket for the modal
      setSelectedBucketDescription(searchBucket.description); // Store description for external buckets
      setManifests([]); // No manifests for external buckets
      setManifestsLoading(false);
    }
  };

  const closeModal = () => {
    setSelectedBucket(null);
    setSelectedSearchBucket(null);
    setSelectedBucketDescription(undefined);
    setManifests([]);
    setManifestsLoading(false);
  };

  const handlePackageClick = async (packageName: string, bucketName: string) => {
    // Create a ScoopPackage object for the package info modal
    const pkg: ScoopPackage = {
      name: packageName,
      version: "", // Will be fetched by package info
      source: bucketName,
      updated: "",
      is_installed: false, // Will be determined by package info
      info: "",
      match_source: "name"
    };
    
    // Simply open package info modal - bucket modal stays open underneath
    await packageInfo.fetchPackageInfo(pkg);
  };

  // Handle bucket installation/removal - refresh bucket list
  const handleBucketInstalled = async () => {
    console.log('Bucket operation completed, refreshing bucket list...');
    await fetchBuckets();
    console.log('Bucket list refreshed successfully');
  };

  // Handle fetching manifests for newly installed bucket
  const handleFetchManifests = async (bucketName: string) => {
    console.log('Fetching manifests for bucket:', bucketName);
    setManifestsLoading(true);
    try {
      const bucketManifests = await getBucketManifests(bucketName);
      setManifests(bucketManifests);
      console.log(`Successfully fetched ${bucketManifests.length} manifests for bucket:`, bucketName);
    } catch (error) {
      console.error('Failed to fetch manifests for bucket:', bucketName, error);
    } finally {
      setManifestsLoading(false);
    }
  };

  // Handle updating a single bucket
  const handleUpdateBucket = async (bucketName: string) => {
    console.log('Updating bucket:', bucketName);
    
    // Add to updating set
    setUpdatingBuckets(prev => new Set([...prev, bucketName]));
    
    try {
      const result = await invoke<BucketUpdateResult>("update_bucket", {
        bucketName: bucketName
      });
      
      // Store result message
      setUpdateResults(prev => ({
        ...prev,
        [bucketName]: result.message
      }));
      
      if (result.success) {
        // Refresh bucket list to reflect any changes
        await fetchBuckets();
        
        // If this bucket is currently selected, refresh its manifests
        const currentBucket = selectedBucket();
        if (currentBucket && currentBucket.name === bucketName) {
          await handleFetchManifests(bucketName);
        }
      }
      
      console.log('Bucket update result:', result);
    } catch (error) {
      console.error('Failed to update bucket:', bucketName, error);
      setUpdateResults(prev => ({
        ...prev,
        [bucketName]: `Failed to update: ${error}`
      }));
    } finally {
      // Remove from updating set
      setUpdatingBuckets(prev => {
        const newSet = new Set(prev);
        newSet.delete(bucketName);
        return newSet;
      });
    }
  };

  // Handle updating all buckets
  const handleUpdateAllBuckets = async () => {
    console.log('Updating all buckets...');
    const gitBuckets = buckets().filter(bucket => bucket.is_git_repo);
    
    // Update all git buckets in parallel
    await Promise.all(
      gitBuckets.map(bucket => handleUpdateBucket(bucket.name))
    );
  };

  return (
    <div class="p-4 sm:p-6 md:p-8">
      <div class="max-w-6xl mx-auto">
        {/* Header Section */}
        <div class={`mb-6 relative transition-all duration-300 ${isSearchActive() ? 'mb-32' : 'mb-6'}`}>
          <div class="flex items-center justify-between">
            <div class={`transition-all duration-300 ${isSearchActive() ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
              <h1 class="text-3xl font-bold mb-2">Buckets</h1>
              <p class="text-base-content/70">
                Manage Scoop buckets - repositories containing package manifests
              </p>
            </div>
            
            <BucketSearch 
              isActive={isSearchActive}
              onToggle={toggleSearch}
              onSearchResults={handleSearchResults}
            />
          </div>
        </div>

        {/* Loading State */}
        <Show when={loading() && !isSearchActive()}>
          <div class="flex justify-center items-center py-8">
            <span class="loading loading-spinner loading-lg"></span>
            <span class="ml-2">Loading buckets...</span>
          </div>
        </Show>

        {/* Error State */}
        <Show when={error() && !isSearchActive()}>
          <div class="alert alert-error mb-4">
            <span>{error()}</span>
          </div>
        </Show>

        {/* Main Content */}
        <Show when={!loading() && !error()}>
          {/* Search Results */}
          <Show when={isSearchActive()}>
            <div class={`transition-all duration-300 ${
              isSearchActive() ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}>
              <div class="card bg-base-100 shadow-lg">
                <div class="card-body">
                  <BucketSearchResults
                    buckets={searchResults()}
                    loading={searchLoading()}
                    error={searchError()}
                    totalCount={searchTotalCount()}
                    isExpandedSearch={isExpandedSearch()}
                    installedBuckets={buckets()}
                    onBucketSelect={handleSearchBucketSelect}
                    onBucketInstalled={handleBucketInstalled}
                  />
                </div>
              </div>
            </div>
          </Show>

          {/* Regular Buckets View */}
          <Show when={!isSearchActive()}>
            <div class={`transition-all duration-300 ${
              !isSearchActive() ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}>
              <BucketGrid 
                buckets={buckets()}
                onViewBucket={handleViewBucket}
                onRefresh={fetchBuckets}
                onUpdateBucket={handleUpdateBucket}
                onUpdateAll={handleUpdateAllBuckets}
                updatingBuckets={updatingBuckets()}
                updateResults={updateResults()}
              />
            </div>
          </Show>
        </Show>
      </div>

      <BucketInfoModal
        bucket={selectedBucket()}
        manifests={manifests()}
        manifestsLoading={manifestsLoading()}
        error={null}
        description={selectedBucketDescription()}
        searchBucket={selectedSearchBucket() || undefined}
        installedBuckets={buckets()}
        onClose={closeModal}
        onPackageClick={handlePackageClick}
        onBucketInstalled={handleBucketInstalled}
        onFetchManifests={handleFetchManifests}
      />
      
      <PackageInfoModal
        pkg={packageInfo.selectedPackage()}
        info={packageInfo.info()}
        loading={packageInfo.loading()}
        error={packageInfo.error()}
        onClose={packageInfo.closeModal}
        onInstall={packageOperations.handleInstall}
        onUninstall={packageOperations.handleUninstall}
        showBackButton={true}
        onPackageStateChanged={() => {
          // Refresh bucket manifests to reflect installation changes
          const currentBucket = selectedBucket();
          if (currentBucket) {
            handleFetchManifests(currentBucket.name);
          }
        }}
      />
      
      <OperationModal
        title={packageOperations.operationTitle()}
        onClose={packageOperations.closeOperationModal}
        isScan={packageOperations.isScanning()}
        onInstallConfirm={packageOperations.handleInstallConfirm}
        nextStep={packageOperations.operationNextStep() ?? undefined}
      />
    </div>
  );
}

export default BucketPage;

import PackageInfoModal from "../components/PackageInfoModal";

import { useSearch } from "../hooks/useSearch";
import SearchBar from "../components/page/search/SearchBar";
import SearchResultsTabs from "../components/page/search/SearchResultsTabs";
import SearchResultsList from "../components/page/search/SearchResultsList";

function SearchPage() {
  const {
    searchTerm, setSearchTerm,
    loading,
    activeTab, setActiveTab,
    resultsToShow,
    packageResults,
    binaryResults,
    selectedPackage,
    info,
    infoLoading,
    infoError,
    handleInstall,
    handleUninstall,
    fetchPackageInfo,
    closeModal,
  } = useSearch();

  return (
    <div class="p-4">
      <div class="max-w-3xl mx-auto">
        <SearchBar searchTerm={searchTerm} setSearchTerm={setSearchTerm} />

        <SearchResultsTabs
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          packageCount={packageResults().length}
          includesCount={binaryResults().length}
        />

        <SearchResultsList
          loading={loading()}
          results={resultsToShow()}
          searchTerm={searchTerm()}
          activeTab={activeTab()}
          onViewInfo={fetchPackageInfo}
          onInstall={handleInstall}
          onPackageStateChanged={() => {}}
        />
      </div>

      <PackageInfoModal
        pkg={selectedPackage()}
        info={info()}
        loading={infoLoading()}
        error={infoError()}
        onClose={closeModal}
        onInstall={handleInstall}
        onUninstall={handleUninstall}
        onPackageStateChanged={() => {}}
      />
    </div>
  );
}

export default SearchPage;

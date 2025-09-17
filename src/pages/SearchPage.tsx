import PackageInfoModal from "../components/PackageInfoModal";
import OperationModal from "../components/OperationModal";

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
    operationTitle,
    operationNextStep,
    isScanning,
    handleInstall,
    handleUninstall,
    handleInstallConfirm,
    fetchPackageInfo,
    closeModal,
    closeOperationModal,
  } = useSearch();

  return (
    <div class="p-4 sm:p-6 md:p-8">
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
          onPackageStateChanged={() => {
            // This will be called when install buttons are clicked
            // The actual refresh will happen in closeOperationModal when the operation completes
          }}
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
        onPackageStateChanged={() => {
          // This will be called when install/uninstall buttons are clicked
          // The actual refresh will happen in closeOperationModal when the operation completes
        }}
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
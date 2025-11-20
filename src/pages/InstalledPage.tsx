import { Show, createSignal, createMemo } from "solid-js";
import PackageInfoModal from "../components/PackageInfoModal";
import OperationModal from "../components/OperationModal";
import ScoopStatusModal from "../components/ScoopStatusModal";
import { useInstalledPackages } from "../hooks/useInstalledPackages";
import InstalledPageHeader from "../components/page/installed/InstalledPageHeader";
import PackageListView from "../components/page/installed/PackageListView";
import PackageGridView from "../components/page/installed/PackageGridView";
import { View } from "../types/scoop";

interface InstalledPageProps {
  onNavigate?: (view: View) => void;
}

function InstalledPage(props: InstalledPageProps) {
  const {
    loading,
    error,
    processedPackages,
    updatableCount,
    uniqueBuckets,
    isCheckingForUpdates,
    viewMode, setViewMode,
    sortKey, sortDirection,
    selectedBucket, setSelectedBucket,
    selectedPackage, info, infoLoading, infoError,
    operationTitle,
    operationNextStep,
    operatingOn,
    scoopStatus,
    statusLoading,
    statusError,
    isPackageVersioned,
    checkScoopStatus,
    handleSort,
    handleUpdate,
    handleUpdateAll,
    handleHold,
    handleUnhold,
    handleSwitchVersion,
    handleUninstall,
    handleFetchPackageInfo,
    handleFetchPackageInfoForVersions,
    handleCloseInfoModalWithVersions,
    autoShowVersions,
    handleCloseOperationModal,
    fetchInstalledPackages,
    checkForUpdates,
  } = useInstalledPackages();

  const [searchQuery, setSearchQuery] = createSignal("");
  const [showStatusModal, setShowStatusModal] = createSignal(false);

  const handleCheckStatus = async () => {
    await checkScoopStatus();
    setShowStatusModal(true);
  };

  const filteredPackages = createMemo(() => {
    const query = searchQuery().toLowerCase();
    if (!query) return processedPackages();

    return processedPackages().filter(p => p.name.toLowerCase().includes(query));
  });

  return (
    <div class="p-4 sm:p-6 md:p-8">
      <InstalledPageHeader
        updatableCount={updatableCount}
        onUpdateAll={handleUpdateAll}
        onCheckStatus={handleCheckStatus}
        statusLoading={statusLoading}
        scoopStatus={scoopStatus}
        uniqueBuckets={uniqueBuckets}
        selectedBucket={selectedBucket}
        setSelectedBucket={setSelectedBucket}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        viewMode={viewMode}
        setViewMode={setViewMode}
        isCheckingForUpdates={isCheckingForUpdates}
        onCheckForUpdates={checkForUpdates}
        onRefresh={fetchInstalledPackages}
      />

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

      <Show when={!loading() && !error() && filteredPackages().length === 0}>
        <div class="text-center py-16">
          <p class="text-xl">No packages installed match the current filter</p>
        </div>
      </Show>

      <Show when={!loading() && !error() && filteredPackages().length > 0}>
        <Show when={viewMode() === 'list'}
          fallback={<PackageGridView
            packages={filteredPackages}
            onViewInfo={handleFetchPackageInfo}
            onViewInfoForVersions={handleFetchPackageInfoForVersions}
            onUpdate={handleUpdate}
            onHold={handleHold}
            onUnhold={handleUnhold}
            onSwitchVersion={handleSwitchVersion}
            onUninstall={handleUninstall}
            operatingOn={operatingOn}
            isPackageVersioned={isPackageVersioned}
          />}
        >
          <PackageListView
            packages={filteredPackages}
            onSort={handleSort}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onViewInfo={handleFetchPackageInfo}
            onViewInfoForVersions={handleFetchPackageInfoForVersions}
            onUpdate={handleUpdate}
            onHold={handleHold}
            onUnhold={handleUnhold}
            onSwitchVersion={handleSwitchVersion}
            onUninstall={handleUninstall}
            operatingOn={operatingOn}
            isPackageVersioned={isPackageVersioned}
          />
        </Show>
      </Show>

      <PackageInfoModal
        pkg={selectedPackage()}
        info={info()}
        loading={infoLoading()}
        error={infoError()}
        onClose={handleCloseInfoModalWithVersions}
        onUninstall={handleUninstall}
        onSwitchVersion={(pkg, version) => {
          console.log(`Switched ${pkg.name} to version ${version}`);
          // The PackageInfoModal already calls onPackageStateChanged which triggers a refresh
        }}
        autoShowVersions={autoShowVersions()}
        isPackageVersioned={isPackageVersioned}
        onPackageStateChanged={fetchInstalledPackages}
      />
      <OperationModal
        title={operationTitle()}
        onClose={handleCloseOperationModal}
        nextStep={operationNextStep() ?? undefined}
      />
      <ScoopStatusModal
        isOpen={showStatusModal()}
        onClose={() => setShowStatusModal(false)}
        status={scoopStatus()}
        loading={statusLoading()}
        error={statusError()}
        onNavigate={props.onNavigate}
      />
    </div>
  );
}

export default InstalledPage; 
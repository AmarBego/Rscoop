import { Show, createSignal, createMemo } from "solid-js";
import { Package, Search } from "lucide-solid";
import PackageInfoModal from "../components/PackageInfoModal";
import ScoopStatusModal from "../components/ScoopStatusModal";
import { useInstalledPackages, type ScoopStatus } from "../hooks/useInstalledPackages";
import installedPackagesStore from "../stores/installedPackagesStore";
import InstalledPageHeader from "../components/page/installed/InstalledPageHeader";
import PackageListView from "../components/page/installed/PackageListView";
import PackageGridView from "../components/page/installed/PackageGridView";
import { View } from "../types/scoop";
import { useI18n } from "../i18n";

interface InstalledPageProps {
  onNavigate?: (view: View) => void;
}

function hasHeldPackageUpdates(status: ScoopStatus) {
  return status.apps_with_issues.some((app) =>
    app.is_held
      && app.is_outdated
      && !app.is_failed
      && !app.is_deprecated
      && !app.is_removed
  );
}

function InstalledPage(props: InstalledPageProps) {
  const { t } = useI18n();
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
    fetchInstalledPackages,
    checkForUpdates,
  } = useInstalledPackages();

  const [searchQuery, setSearchQuery] = createSignal("");
  const [showStatusModal, setShowStatusModal] = createSignal(false);

  const handleCheckStatus = async (): Promise<void> => {
    const status = await checkScoopStatus();
    if (status && (!status.is_everything_ok || hasHeldPackageUpdates(status))) {
      setShowStatusModal(true);
    }
  };

  const filteredPackages = createMemo(() => {
    const query = searchQuery().toLowerCase();
    if (!query) return processedPackages();

    return processedPackages().filter(p => p.name.toLowerCase().includes(query));
  });

  return (
    <div class="p-4">
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
      />

      <Show when={loading() && processedPackages().length === 0}>
        <div class="flex justify-center items-center h-64">
          <span class="loading loading-spinner loading-lg"></span>
        </div>
      </Show>

      <Show when={error()}>
        <div role="alert" class="alert alert-error">
          <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span>{t("common.errorWithDetails", { error: error() ?? "" })}</span>
          <button type="button" class="btn btn-sm btn-primary" onClick={fetchInstalledPackages}>{t("common.retry")}</button>
        </div>
      </Show>

      <Show when={!loading() && !error() && filteredPackages().length === 0}>
        <Show
          when={installedPackagesStore.packages().length === 0}
          fallback={
            <div class="text-center py-16 flex flex-col items-center gap-3">
              <p class="text-lg text-base-content/70">{t("installed.noPackages")}</p>
              <button
                type="button"
                class="btn btn-sm btn-ghost"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedBucket("all");
                }}
              >
                {t("installed.emptyClearFilter")}
              </button>
            </div>
          }
        >
          <div class="text-center py-20 flex flex-col items-center gap-4 max-w-md mx-auto">
            <Package class="w-12 h-12 text-base-content/30" aria-hidden="true" strokeWidth={1.5} />
            <h3 class="text-xl font-semibold">{t("installed.emptyTitle")}</h3>
            <p class="text-sm text-base-content/60 leading-relaxed">{t("installed.emptyBody")}</p>
            <Show when={props.onNavigate}>
              <button
                type="button"
                class="btn btn-primary btn-sm gap-2 mt-2"
                onClick={() => props.onNavigate?.("search")}
              >
                <Search class="w-4 h-4" />
                {t("installed.emptyAction")}
              </button>
            </Show>
          </div>
        </Show>
      </Show>

      <Show when={!error() && filteredPackages().length > 0}>
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

import { For, Show, Accessor } from "solid-js";
import {
  Ellipsis, CircleArrowUp, Trash2, Lock, LockOpen, RefreshCw
} from 'lucide-solid';
import type { DisplayPackage } from "../../../stores/installedPackagesStore";
import type { ScoopPackage } from "../../../types/scoop";
import heldStore from "../../../stores/held";
import { formatIsoDate } from "../../../utils/date";
import { useI18n } from "../../../i18n";
import { Dropdown, DropdownItem, DropdownLoadingItem } from "../../common/Dropdown";

interface PackageGridViewProps {
  packages: Accessor<DisplayPackage[]>;
  onViewInfo: (pkg: ScoopPackage) => void;
  onViewInfoForVersions: (pkg: ScoopPackage) => void;
  onUpdate: (pkg: ScoopPackage) => void;
  onHold: (pkgName: string) => void;
  onUnhold: (pkgName: string) => void;
  onSwitchVersion: (pkgName: string, version: string) => void;
  onUninstall: (pkg: ScoopPackage) => void;
  operatingOn: Accessor<string | null>;
  isPackageVersioned: (packageName: string) => boolean;
}

function PackageGridView(props: PackageGridViewProps) {
  const { t } = useI18n();
  return (
    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      <For each={props.packages()}>
        {(pkg) => {
          const hasUpdate = () => pkg.available_version && !heldStore.isHeld(pkg.name) && !pkg.is_versioned_install;
          return (
            <div
              class="bg-base-300 hover:bg-base-400 rounded-lg p-3 transition-colors"
              classList={{ "ring-1 ring-primary/40": !!hasUpdate() }}
              data-no-close-search
            >
              <div class="flex justify-between items-start gap-2 min-w-0">
                <h3 class="font-medium text-base min-w-0 flex-1 flex items-center gap-1.5">
                  <button class="hover:underline truncate text-left min-w-0" onClick={() => props.onViewInfo(pkg)} title={pkg.name}>
                    {pkg.name}
                  </button>
                  <Show when={hasUpdate()}>
                    <span class="tooltip shrink-0" data-tip={t("installed.updateAvailable", { version: pkg.available_version ?? "" })}>
                      <CircleArrowUp class="w-4 h-4 text-primary" />
                    </span>
                  </Show>
                  <Show when={pkg.is_versioned_install}>
                    <span class="tooltip shrink-0" data-tip={t("installed.versionedInstallTooltip")}>
                      <Lock class="w-4 h-4 text-versioned" />
                    </span>
                  </Show>
                  <Show when={heldStore.isHeld(pkg.name) && !pkg.is_versioned_install}>
                    <span class="tooltip shrink-0" data-tip={t("installed.onHoldTooltip")}>
                      <Lock class="w-4 h-4 text-warning" />
                    </span>
                  </Show>
                </h3>
                <div class="shrink-0">
                  <Dropdown
                    size="sm"
                    iconOnly
                    ariaLabel={t("installed.tableActions")}
                    trigger={<Ellipsis class="w-4 h-4" />}
                  >
                    <Show when={hasUpdate()}>
                      <DropdownItem icon={<CircleArrowUp class="w-4 h-4" />} onClick={() => props.onUpdate(pkg)}>
                        {t("installed.updateTo", { version: pkg.available_version ?? "" })}
                      </DropdownItem>
                    </Show>
                    <Show when={props.operatingOn() === pkg.name}
                      fallback={
                        <Show when={pkg.is_versioned_install}
                          fallback={
                            <Show when={heldStore.isHeld(pkg.name)}
                              fallback={
                                <DropdownItem icon={<Lock class="w-4 h-4" />} onClick={() => props.onHold(pkg.name)}>
                                  {t("installed.holdPackage")}
                                </DropdownItem>
                              }
                            >
                              <DropdownItem icon={<LockOpen class="w-4 h-4" />} onClick={() => props.onUnhold(pkg.name)}>
                                {t("installed.unholdPackage")}
                              </DropdownItem>
                            </Show>
                          }
                        >
                          <DropdownItem disabled icon={<Lock class="w-4 h-4 text-versioned" />}>
                            {t("installed.cannotUnholdVersioned")}
                          </DropdownItem>
                        </Show>
                      }
                    >
                      <DropdownLoadingItem />
                    </Show>
                    <Show when={props.isPackageVersioned(pkg.name)}>
                      <DropdownItem icon={<RefreshCw class="w-4 h-4" />} onClick={() => props.onViewInfoForVersions(pkg)}>
                        {t("installed.switchVersion")}
                      </DropdownItem>
                    </Show>
                    <DropdownItem destructive icon={<Trash2 class="w-4 h-4" />} onClick={() => props.onUninstall(pkg)}>
                      {t("common.uninstall")}
                    </DropdownItem>
                  </Dropdown>
                </div>
              </div>
              <p class="text-xs text-base-content/60 mt-1.5 truncate" title={pkg.updated}>
                v{pkg.version} · {pkg.source} · {formatIsoDate(pkg.updated)}
              </p>
            </div>
          );
        }}
      </For>
    </div>
  );
}

export default PackageGridView; 
import { For, Show, Accessor } from "solid-js";
import {
  Ellipsis, CircleArrowUp, Trash2, ArrowUp, ArrowDown, Lock, LockOpen, RefreshCw
} from 'lucide-solid';
import type { DisplayPackage } from "../../../stores/installedPackagesStore";
import type { ScoopPackage } from "../../../types/scoop";
import heldStore from "../../../stores/held";
import { formatIsoDate } from "../../../utils/date";
import { useI18n } from "../../../i18n";
import { Dropdown, DropdownItem, DropdownLoadingItem } from "../../common/Dropdown";

type SortKey = 'name' | 'version' | 'source' | 'updated';

interface PackageListViewProps {
  packages: Accessor<DisplayPackage[]>;
  onSort: (key: SortKey) => void;
  sortKey: Accessor<SortKey>;
  sortDirection: Accessor<'asc' | 'desc'>;
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

const SortableHeader = (props: {
  key: SortKey,
  title: string,
  onSort: (key: SortKey) => void,
  sortKey: Accessor<SortKey>,
  sortDirection: Accessor<'asc' | 'desc'>
}) => {
  const ariaSort = (): "ascending" | "descending" | "none" => {
    if (props.sortKey() !== props.key) return "none";
    return props.sortDirection() === 'asc' ? "ascending" : "descending";
  };
  return (
    <th aria-sort={ariaSort()} class="select-none p-0">
      <button
        type="button"
        class="w-full text-start px-4 py-3 flex items-center gap-2 hover:bg-base-200"
        onClick={() => props.onSort(props.key)}
      >
        {props.title}
        <Show when={props.sortKey() === props.key}>
          <Show when={props.sortDirection() === 'asc'} fallback={<ArrowDown class="w-4 h-4" />}>
            <ArrowUp class="w-4 h-4" />
          </Show>
        </Show>
      </button>
    </th>
  );
};

function PackageListView(props: PackageListViewProps) {
  const { t } = useI18n();
  return (
    <div class="overflow-x-auto bg-base-300 rounded-xl shadow-xl">
      <table class="table">
        <thead>
          <tr>
            <SortableHeader key="name" title={t("installed.tableName")} onSort={props.onSort} sortKey={props.sortKey} sortDirection={props.sortDirection} />
            <SortableHeader key="version" title={t("installed.tableVersion")} onSort={props.onSort} sortKey={props.sortKey} sortDirection={props.sortDirection} />
            <SortableHeader key="source" title={t("installed.tableBucket")} onSort={props.onSort} sortKey={props.sortKey} sortDirection={props.sortDirection} />
            <SortableHeader key="updated" title={t("installed.tableUpdated")} onSort={props.onSort} sortKey={props.sortKey} sortDirection={props.sortDirection} />
            <th class="text-center">{t("installed.tableActions")}</th>
          </tr>
        </thead>
        <tbody>
          <For each={props.packages()}>
            {(pkg, index) => (
              <tr data-no-close-search>
                <td>
                  <div class="flex items-center gap-2">
                    <button class="btn btn-ghost btn-sm" onClick={() => props.onViewInfo(pkg)}>
                      {pkg.name}
                    </button>
                    <Show when={pkg.available_version && !heldStore.isHeld(pkg.name) && !pkg.is_versioned_install}>
                      <div class="tooltip" data-tip={t("installed.updateAvailable", { version: pkg.available_version ?? "" })}>
                        <CircleArrowUp class="w-4 h-4 text-primary" />
                      </div>
                    </Show>
                    <Show when={pkg.is_versioned_install}>
                      <div class="tooltip" data-tip={t("installed.versionedInstallTooltip")}>
                        <Lock class="w-4 h-4 text-versioned" />
                      </div>
                    </Show>
                    <Show when={heldStore.isHeld(pkg.name) && !pkg.is_versioned_install}>
                      <div class="tooltip" data-tip={t("installed.onHoldTooltip")}>
                        <Lock class="w-4 h-4 text-warning" />
                      </div>
                    </Show>
                  </div>
                </td>
                <td>{pkg.version}</td>
                <td>{pkg.source}</td>
                <td title={pkg.updated}>{formatIsoDate(pkg.updated)}</td>
                <td class="text-center">
                  <Dropdown
                    size="sm"
                    iconOnly
                    direction={index() * 2 >= props.packages().length - 1 ? "top" : "bottom"}
                    ariaLabel={t("installed.tableActions")}
                    trigger={<Ellipsis class="w-4 h-4" />}
                  >
                    <Show when={pkg.available_version && !heldStore.isHeld(pkg.name) && !pkg.is_versioned_install}>
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
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}

export default PackageListView;

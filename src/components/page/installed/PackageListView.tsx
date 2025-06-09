import { For, Show, Accessor } from "solid-js";
import { 
  MoreHorizontal, ArrowUpCircle, Trash2, ArrowUp, ArrowDown, Lock, Unlock
} from 'lucide-solid';
import type { DisplayPackage } from "../../../stores/installedPackagesStore";
import type { ScoopPackage } from "../../../types/scoop";
import heldStore from "../../../stores/held";
import { formatIsoDate } from "../../../utils/date";

type SortKey = 'name' | 'version' | 'source' | 'updated';

interface PackageListViewProps {
  packages: Accessor<DisplayPackage[]>;
  onSort: (key: SortKey) => void;
  sortKey: Accessor<SortKey>;
  sortDirection: Accessor<'asc' | 'desc'>;
  onViewInfo: (pkg: ScoopPackage) => void;
  onUpdate: (pkg: ScoopPackage) => void;
  onHold: (pkgName: string) => void;
  onUnhold: (pkgName: string) => void;
  onUninstall: (pkg: ScoopPackage) => void;
  operatingOn: Accessor<string | null>;
}

const SortableHeader = (props: { 
  key: SortKey, 
  title: string, 
  onSort: (key: SortKey) => void,
  sortKey: Accessor<SortKey>,
  sortDirection: Accessor<'asc' | 'desc'>
}) => (
  <th class="cursor-pointer select-none" onClick={() => props.onSort(props.key)}>
    <div class="flex items-center gap-2">
      {props.title}
      <Show when={props.sortKey() === props.key}>
        <Show when={props.sortDirection() === 'asc'} fallback={<ArrowDown class="w-4 h-4" />}>
          <ArrowUp class="w-4 h-4" />
        </Show>
      </Show>
    </div>
  </th>
);

function PackageListView(props: PackageListViewProps) {
  return (
    <div class="overflow-x-auto bg-base-200 rounded-xl shadow-xl">
      <table class="table">
        <thead>
          <tr>
            <SortableHeader key="name" title="Name" onSort={props.onSort} sortKey={props.sortKey} sortDirection={props.sortDirection} />
            <SortableHeader key="version" title="Version" onSort={props.onSort} sortKey={props.sortKey} sortDirection={props.sortDirection} />
            <SortableHeader key="source" title="Source" onSort={props.onSort} sortKey={props.sortKey} sortDirection={props.sortDirection} />
            <SortableHeader key="updated" title="Updated" onSort={props.onSort} sortKey={props.sortKey} sortDirection={props.sortDirection} />
            <th class="text-center">Actions</th>
          </tr>
        </thead>
        <tbody>
          <For each={props.packages()}>
            {(pkg, index) => (
              <tr>
                <td>
                  <div class="flex items-center gap-2">
                    <button class="btn btn-ghost btn-sm" onClick={() => props.onViewInfo(pkg)}>
                      {pkg.name}
                    </button>
                    <Show when={pkg.available_version && !heldStore.isHeld(pkg.name)}>
                      <div class="tooltip" data-tip={`Update available: ${pkg.available_version}`}>
                        <ArrowUpCircle class="w-4 h-4 text-primary" />
                      </div>
                    </Show>
                    <Show when={heldStore.isHeld(pkg.name)}>
                       <div class="tooltip" data-tip="This package is on hold.">
                         <Lock class="w-4 h-4 text-warning" />
                       </div>
                    </Show>
                  </div>
                </td>
                <td>{pkg.version}</td>
                <td>{pkg.source}</td>
                <td title={pkg.updated}>{formatIsoDate(pkg.updated)}</td>
                <td class="text-center">
                  <div
                    class="dropdown dropdown-end"
                    classList={{
                      'dropdown-top': index() > props.packages().length / 2 && props.packages().length > 5,
                    }}
                  >
                    <label tabindex="0" class="btn btn-ghost btn-xs btn-circle">
                      <MoreHorizontal class="w-4 h-4" />
                    </label>
                    <ul tabindex="0" class="dropdown-content menu p-2 shadow bg-base-300 rounded-box w-52 z-[1]">
                      <Show when={pkg.available_version && !heldStore.isHeld(pkg.name)}>
                        <li>
                          <a onClick={() => props.onUpdate(pkg)}>
                            <ArrowUpCircle class="w-4 h-4 mr-2" />
                            Update to {pkg.available_version}
                          </a>
                        </li>
                      </Show>
                      <li>
                        <Show when={props.operatingOn() === pkg.name}
                            fallback={
                                <Show when={heldStore.isHeld(pkg.name)}
                                    fallback={
                                        <a onClick={() => props.onHold(pkg.name)}>
                                            <Lock class="w-4 h-4 mr-2" />
                                            <span>Hold Package</span>
                                        </a>
                                    }
                                >
                                    <a onClick={() => props.onUnhold(pkg.name)}>
                                        <Unlock class="w-4 h-4 mr-2" />
                                        <span>Unhold Package</span>
                                    </a>
                                </Show>
                            }
                        >
                             <span class="flex items-center justify-center p-2">
                                <span class="loading loading-spinner loading-xs"></span>
                            </span>
                        </Show>
                      </li>
                      <li>
                        <a class="text-error" onClick={() => props.onUninstall(pkg)}>
                          <Trash2 class="w-4 h-4 mr-2" />
                          Uninstall
                        </a>
                      </li>
                    </ul>
                  </div>
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
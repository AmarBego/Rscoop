import { For, Show, Accessor } from "solid-js";
import { 
  MoreHorizontal, ArrowUpCircle, Trash2, Lock, Unlock, RefreshCw
} from 'lucide-solid';
import type { DisplayPackage } from "../../../stores/installedPackagesStore";
import type { ScoopPackage } from "../../../types/scoop";
import heldStore from "../../../stores/held";
import { formatIsoDate } from "../../../utils/date";

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
  return (
    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
      <For each={props.packages()}>
        {(pkg) => (
          <div class="card bg-base-200 shadow-xl transition-transform transform hover:scale-101" data-no-close-search>
            <div class="card-body">
              <div class="flex justify-between items-start mb-2">
                <h2 class="card-title">
                  <button class="hover:underline" onClick={() => props.onViewInfo(pkg)}>
                    {pkg.name}
                  </button>
                  <Show when={pkg.available_version && !heldStore.isHeld(pkg.name) && !pkg.is_versioned_install}>
                      <div class="tooltip" data-tip={`Update available: ${pkg.available_version}`}>
                        <ArrowUpCircle class="w-4 h-4 text-primary" />
                      </div>
                  </Show>
                  <Show when={pkg.is_versioned_install}>
                      <div class="tooltip" data-tip="Versioned install - cannot be updated">
                        <Lock class="w-4 h-4 text-cyan-400" />
                      </div>
                  </Show>
                  <Show when={heldStore.isHeld(pkg.name) && !pkg.is_versioned_install}>
                       <div class="tooltip" data-tip="This package is on hold">
                         <Lock class="w-4 h-4 text-warning" />
                       </div>
                    </Show>
                </h2>
                <div class="dropdown dropdown-end">
                    <label tabindex="0" class="btn btn-ghost btn-xs btn-circle">
                      <MoreHorizontal class="w-4 h-4" />
                    </label>
                    <ul tabindex="0" class="dropdown-content menu p-2 shadow bg-base-300 rounded-box w-52 z-[1]">
                      <Show when={pkg.available_version && !heldStore.isHeld(pkg.name) && !pkg.is_versioned_install}>
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
                                <Show when={pkg.is_versioned_install}
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
                                    <a class="btn-disabled cursor-not-allowed">
                                        <Lock class="w-4 h-4 mr-2 text-cyan-400" />
                                        <span>Cannot Unhold (Versioned)</span>
                                    </a>
                                </Show>
                            }
                        >
                            <span class="flex items-center justify-center p-2">
                                <span class="loading loading-spinner loading-xs"></span>
                            </span>
                        </Show>
                      </li>
                      <Show when={props.isPackageVersioned(pkg.name)}>
                        <li>
                          <a onClick={() => {
                            props.onViewInfoForVersions(pkg);
                          }}>
                            <RefreshCw class="w-4 h-4 mr-2" />
                            Switch Version
                          </a>
                        </li>
                      </Show>
                      <li>
                        <a class="text-error" onClick={() => props.onUninstall(pkg)}>
                          <Trash2 class="w-4 h-4 mr-2" />
                          Uninstall
                        </a>
                      </li>
                    </ul>
                  </div>
              </div>
              <p class="text-sm text-base-content/70">
                Version {pkg.version}
              </p>
              <p class="text-xs text-base-content/70">
                Bucket {pkg.source}
              </p>
              <p class="text-xs text-base-content/50" title={pkg.updated}>Updated on {formatIsoDate(pkg.updated)}</p>
            </div>
          </div>
        )}
      </For>
    </div>
  );
}

export default PackageGridView; 
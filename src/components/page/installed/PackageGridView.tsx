import { For, Show, Accessor } from "solid-js";
import { 
  MoreHorizontal, ArrowUpCircle, Trash2, Lock, Unlock
} from 'lucide-solid';
import type { DisplayPackage } from "../../../hooks/useInstalledPackages";
import type { ScoopPackage } from "../../../types/scoop";
import heldStore from "../../../stores/held";

interface PackageGridViewProps {
  packages: Accessor<DisplayPackage[]>;
  onViewInfo: (pkg: ScoopPackage) => void;
  onUpdate: (pkg: ScoopPackage) => void;
  onHold: (pkgName: string) => void;
  onUnhold: (pkgName: string) => void;
  onUninstall: (pkg: ScoopPackage) => void;
}

function PackageGridView(props: PackageGridViewProps) {
  return (
    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
      <For each={props.packages()}>
        {(pkg) => (
          <div class="card bg-base-200 shadow-xl transition-transform transform hover:scale-101">
            <div class="card-body">
              <div class="flex justify-between items-start mb-2">
                <h2 class="card-title">
                  <button class="hover:underline" onClick={() => props.onViewInfo(pkg)}>
                    {pkg.name}
                  </button>
                  <Show when={pkg.available_version && !heldStore.isHeld(pkg.name)}>
                      <div class="tooltip" data-tip={`Update available: ${pkg.available_version}`}>
                        <ArrowUpCircle class="w-4 h-4 text-primary" />
                      </div>
                  </Show>
                   <Show when={heldStore.isHeld(pkg.name)}>
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
                      <Show when={pkg.available_version && !heldStore.isHeld(pkg.name)}>
                        <li>
                          <a onClick={() => props.onUpdate(pkg)}>
                            <ArrowUpCircle class="w-4 h-4 mr-2" />
                            Update to {pkg.available_version}
                          </a>
                        </li>
                      </Show>
                      <li>
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
                      </li>
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
                Version {pkg.version} from <span class="font-semibold">{pkg.source}</span>
              </p>
              <p class="text-xs text-base-content/50">Updated on {pkg.updated.split(" ")[0]}</p>
            </div>
          </div>
        )}
      </For>
    </div>
  );
}

export default PackageGridView; 
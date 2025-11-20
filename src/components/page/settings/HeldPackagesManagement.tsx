import { For, Show } from "solid-js";
import { BellOff, LockOpen } from "lucide-solid";
import heldStore from "../../../stores/held";

interface HeldPackagesManagementProps {
  onUnhold: (packageName: string) => void;
  operationInProgress: boolean;
}

export default function HeldPackagesManagement(props: HeldPackagesManagementProps) {
  const { store: heldPackagesStore } = heldStore;

  return (
    <div class="card bg-base-200 shadow-xl">
      <div class="card-body">
        <h2 class="card-title text-xl">
          <BellOff class="w-6 h-6 mr-2 text-warning" />
          Held Packages Management
        </h2>
        <p class="text-base-content/80 mb-4">
          Packages on hold are prevented from being updated via <code>scoop update *</code>.
        </p>

        <Show
          when={!heldPackagesStore.isLoading}
          fallback={<div class="flex justify-center p-4"><span class="loading loading-dots loading-md"></span></div>}
        >
          <Show
            when={heldPackagesStore.packages.length > 0}
            fallback={<p class="text-base-content/60 p-4 text-center">No packages are currently on hold.</p>}
          >
            <div class="max-h-60 overflow-y-auto pr-2">
              <ul class="space-y-2">
                <For each={heldPackagesStore.packages}>
                  {(pkgName) => (
                    <li class="flex justify-between items-center bg-base-100 p-2 rounded-lg transition-colors hover:bg-base-300">
                      <span class="font-mono text-sm">{pkgName}</span>
                      <button
                        class="btn btn-xs btn-ghost text-info"
                        onClick={() => props.onUnhold(pkgName)}
                        aria-label={`Remove hold from ${pkgName}`}
                        disabled={props.operationInProgress}
                      >
                        <LockOpen class="w-4 h-4 mr-1" />
                        Unhold
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  );
} 
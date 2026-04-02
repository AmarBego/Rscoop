import { For, Show } from "solid-js";
import { CirclePause, LockOpen } from "lucide-solid";
import heldStore from "../../../stores/held";
import Card from "../../common/Card";
import { useI18n } from "../../../i18n";

interface HeldPackagesManagementProps {
  onUnhold: (packageName: string) => void;
  operationInProgress: boolean;
}

export default function HeldPackagesManagement(props: HeldPackagesManagementProps) {
  const { t } = useI18n();
  const { store: heldPackagesStore } = heldStore;

  return (
    <Card
      title={t("settings.heldPackages.title")}
      icon={CirclePause}
      description={t("settings.heldPackages.description")}
    >
      <Show
        when={!heldPackagesStore.isLoading}
        fallback={<div class="flex justify-center p-4"><span class="loading loading-dots loading-sm"></span></div>}
      >
        <Show
          when={heldPackagesStore.packages.length > 0}
          fallback={<p class="text-base-content/50 text-sm">{t("settings.heldPackages.empty")}</p>}
        >
          <div class="max-h-60 overflow-y-auto">
            <ul class="space-y-1">
              <For each={heldPackagesStore.packages}>
                {(pkgName) => (
                  <li class="flex justify-between items-center bg-base-100 px-3 py-1.5 rounded-lg">
                    <span class="font-mono text-sm">{pkgName}</span>
                    <button
                      class="btn btn-xs btn-ghost text-info"
                      onClick={() => props.onUnhold(pkgName)}
                      aria-label={t("settings.heldPackages.unholdAriaLabel", { name: pkgName })}
                      disabled={props.operationInProgress}
                    >
                      <LockOpen class="w-3.5 h-3.5 mr-1" />
                      {t("settings.heldPackages.unhold")}
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </div>
        </Show>
      </Show>
    </Card>
  );
}

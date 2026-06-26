import { Show } from "solid-js";
import { CircleCheckBig, TriangleAlert, WifiOff, FolderOpen } from "lucide-solid";
import { View } from "../types/scoop";
import type { AppStatusInfo, ScoopStatus } from "../hooks/useInstalledPackages";
import Modal from "./common/Modal";
import { useI18n } from "../i18n";

interface ScoopStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: ScoopStatus | null;
  loading: boolean;
  error: string | null;
  onNavigate?: (view: View) => void;
}

function isHeldUpdateOnly(app: AppStatusInfo) {
  return app.is_held
    && app.is_outdated
    && !app.is_failed
    && !app.is_deprecated
    && !app.is_removed;
}

function isAppIssue(app: AppStatusInfo) {
  return !isHeldUpdateOnly(app);
}

function AppStatusTable(props: { apps: AppStatusInfo[] }) {
  const { t } = useI18n();

  return (
    <div class="overflow-x-auto">
      <table class="table table-zebra w-full">
        <thead>
          <tr>
            <th>{t("modal.scoopStatus.tableName")}</th>
            <th>{t("modal.scoopStatus.tableInstalled")}</th>
            <th>{t("modal.scoopStatus.tableLatest")}</th>
            <th>{t("modal.scoopStatus.tableStatus")}</th>
          </tr>
        </thead>
        <tbody>
          {props.apps.map((app: AppStatusInfo) => (
            <tr>
              <td class="font-medium">{app.name}</td>
              <td>{app.installed_version}</td>
              <td>{app.latest_version || "-"}</td>
              <td>
                <div class="flex flex-wrap gap-1">
                  {app.is_held && (
                    <div class="badge badge-sm badge-warning">{t("modal.scoopStatus.held")}</div>
                  )}
                  {app.info.filter((info: string) => !info.includes("Held package")).map((info: string) => (
                    <div class="badge badge-sm" classList={{
                      "badge-warning": info.includes("Deprecated"),
                      "badge-error": info.includes("failed") || info.includes("removed"),
                      "badge-info": !info.includes("Deprecated") && !info.includes("failed") && !info.includes("removed")
                    }}>
                      {info}
                    </div>
                  ))}
                  {app.is_outdated && (
                    <div class="badge badge-sm badge-success">{t("modal.scoopStatus.updateAvailable")}</div>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScoopStatusModal(props: ScoopStatusModalProps) {
  const { t } = useI18n();
  const appsWithIssues = () => props.status?.apps_with_issues.filter(isAppIssue) ?? [];
  const heldAppsWithUpdates = () => props.status?.apps_with_issues.filter(isHeldUpdateOnly) ?? [];

  return (
    <Modal
      isOpen={props.isOpen}
      onClose={props.onClose}
      title={t("modal.scoopStatus.title")}
      size="large"
      footer={
        <Show when={props.status?.bucket_needs_update && props.onNavigate}>
          <button
            class="btn btn-primary btn-sm"
            onClick={() => {
              props.onNavigate?.("bucket");
              props.onClose();
            }}
          >
            <FolderOpen class="w-4 h-4 me-2" />
            {t("modal.scoopStatus.goToBuckets")}
          </button>
        </Show>
      }
    >
      <Show when={props.loading}>
        <div class="flex justify-center items-center py-8">
          <span class="loading loading-spinner loading-lg"></span>
        </div>
      </Show>

      <Show when={props.error}>
        <div class="alert alert-error alert-outline">
          <TriangleAlert class="w-4 h-4" />
          <span>{t("modal.scoopStatus.errorChecking", { error: props.error ?? "" })}</span>
        </div>
      </Show>

      <Show when={!props.loading && !props.error ? props.status : null}>
        {(status) => (
        <div class="space-y-4">
          {/* Overall Status */}
          <div class="alert" classList={{
            "alert-success alert-outline": status().is_everything_ok,
            "alert-warning alert-outline": !status().is_everything_ok
          }}>
            <Show when={status().is_everything_ok}
              fallback={<TriangleAlert class="w-4 h-4" />}
            >
              <CircleCheckBig class="w-4 h-4" />
            </Show>
            <span>
              {status().is_everything_ok
                ? t("modal.scoopStatus.everythingOk")
                : t("modal.scoopStatus.issuesFound")}
            </span>
          </div>

          {/* Scoop Updates */}
          <Show when={status().scoop_needs_update}>
            <div class="alert alert-warning alert-outline">
              <TriangleAlert class="w-4 h-4" />
              <span>{t("modal.scoopStatus.scoopOutOfDate")}</span>
            </div>
          </Show>

          {/* Bucket Updates */}
          <Show when={status().bucket_needs_update}>
            <div class="alert alert-warning alert-outline">
              <TriangleAlert class="w-4 h-4" />
              <span>{t("modal.scoopStatus.bucketsOutOfDate")}</span>
            </div>
          </Show>

          {/* Network Issues */}
          <Show when={status().network_failure}>
            <div class="alert alert-error alert-outline">
              <WifiOff class="w-4 h-4" />
              <span>{t("modal.scoopStatus.networkFailure")}</span>
            </div>
          </Show>

          {/* Apps with Issues */}
          <Show when={appsWithIssues().length > 0}>
            <div class="space-y-2">
              <h4 class="font-semibold">{t("modal.scoopStatus.appsWithIssues")}</h4>
              <AppStatusTable apps={appsWithIssues()} />
            </div>
          </Show>

          {/* Held Packages with Updates */}
          <Show when={heldAppsWithUpdates().length > 0}>
            <div class="space-y-2">
              <h4 class="font-semibold">{t("modal.scoopStatus.heldPackagesWithUpdates")}</h4>
              <AppStatusTable apps={heldAppsWithUpdates()} />
            </div>
          </Show>

          {/* All Good Message */}
          <Show when={status().is_everything_ok && !status().network_failure && heldAppsWithUpdates().length === 0}>
            <div class="alert alert-success alert-outline">
              <CircleCheckBig class="w-4 h-4" />
              <span>{t("modal.scoopStatus.allGood")}</span>
            </div>
          </Show>
        </div>
        )}
      </Show>
    </Modal>
  );
}

export default ScoopStatusModal;

import { Show } from "solid-js";
import { CircleCheckBig, TriangleAlert, WifiOff, FolderOpen } from "lucide-solid";
import { View } from "../types/scoop";
import Modal from "./common/Modal";
import { useI18n } from "../i18n";

interface ScoopStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: any;
  loading: boolean;
  error: string | null;
  onNavigate?: (view: View) => void;
}

function ScoopStatusModal(props: ScoopStatusModalProps) {
  const { t } = useI18n();
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
            <FolderOpen class="w-4 h-4 mr-2" />
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

      <Show when={props.status && !props.loading && !props.error}>
        <div class="space-y-4">
          {/* Overall Status */}
          <div class="alert" classList={{
            "alert-success alert-outline": props.status.is_everything_ok,
            "alert-warning alert-outline": !props.status.is_everything_ok
          }}>
            <Show when={props.status.is_everything_ok}
              fallback={<TriangleAlert class="w-4 h- 4" />}
            >
              <CircleCheckBig class="w-4 h-4" />
            </Show>
            <span>
              {props.status.is_everything_ok
                ? t("modal.scoopStatus.everythingOk")
                : t("modal.scoopStatus.issuesFound")}
            </span>
          </div>

          {/* Scoop Updates */}
          <Show when={props.status.scoop_needs_update}>
            <div class="alert alert-warning alert-outline">
              <TriangleAlert class="w-4 h-4" />
              <span>{t("modal.scoopStatus.scoopOutOfDate")}</span>
            </div>
          </Show>

          {/* Bucket Updates */}
          <Show when={props.status.bucket_needs_update}>
            <div class="alert alert-warning alert-outline">
              <TriangleAlert class="w-4 h-4" />
              <span>{t("modal.scoopStatus.bucketsOutOfDate")}</span>
            </div>
          </Show>

          {/* Network Issues */}
          <Show when={props.status.network_failure}>
            <div class="alert alert-error alert-outline">
              <WifiOff class="w-4 h-4" />
              <span>{t("modal.scoopStatus.networkFailure")}</span>
            </div>
          </Show>

          {/* Apps with Issues */}
          <Show when={props.status.apps_with_issues?.length > 0}>
            <div class="space-y-2">
              <h4 class="font-semibold">{t("modal.scoopStatus.appsWithIssues")}</h4>
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
                    {props.status.apps_with_issues.map((app: any) => (
                      <tr>
                        <td class="font-medium">{app.name}</td>
                        <td>{app.installed_version}</td>
                        <td>{app.latest_version || "-"}</td>
                        <td>
                          <div class="flex flex-wrap gap-1">
                            {/* Show held status first if applicable */}
                            {app.is_held && (
                              <div class="badge badge-sm badge-warning">{t("modal.scoopStatus.held")}</div>
                            )}
                            {/* Show other info badges, excluding duplicate "Held package" */}
                            {app.info.filter((info: string) => !info.includes("Held package")).map((info: string) => (
                              <div class="badge badge-sm" classList={{
                                "badge-warning": info.includes("Deprecated"),
                                "badge-error": info.includes("failed") || info.includes("removed"),
                                "badge-info text-cyan-400": info.includes("Versioned install"),
                                "badge-info": !info.includes("Deprecated") && !info.includes("failed") && !info.includes("removed") && !info.includes("Versioned install")
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
            </div>
          </Show>

          {/* All Good Message */}
          <Show when={props.status.is_everything_ok && !props.status.network_failure}>
            <div class="alert alert-success alert-outline">
              <CircleCheckBig class="w-4 h-4" />
              <span>{t("modal.scoopStatus.allGood")}</span>
            </div>
          </Show>
        </div>
      </Show>
    </Modal>
  );
}

export default ScoopStatusModal;
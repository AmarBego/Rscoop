import { Show } from "solid-js";
import { CircleCheckBig, TriangleAlert, WifiOff, FolderOpen } from "lucide-solid";
import { View } from "../types/scoop";
import Modal from "./common/Modal";

interface ScoopStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: any;
  loading: boolean;
  error: string | null;
  onNavigate?: (view: View) => void;
}

function ScoopStatusModal(props: ScoopStatusModalProps) {
  return (
    <Modal
      isOpen={props.isOpen}
      onClose={props.onClose}
      title="Scoop Status"
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
            Go to Buckets
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
          <span>Error checking status: {props.error}</span>
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
                ? "Everything is ok!"
                : "Some issues found"}
            </span>
          </div>

          {/* Scoop Updates */}
          <Show when={props.status.scoop_needs_update}>
            <div class="alert alert-warning alert-outline">
              <TriangleAlert class="w-4 h-4" />
              <span>Scoop is out of date. Run 'scoop update' to get the latest changes.</span>
            </div>
          </Show>

          {/* Bucket Updates */}
          <Show when={props.status.bucket_needs_update}>
            <div class="alert alert-warning alert-outline">
              <TriangleAlert class="w-4 h-4" />
              <span>Scoop bucket(s) are out of date. Click 'Go to Buckets' to get the latest changes.</span>
            </div>
          </Show>

          {/* Network Issues */}
          <Show when={props.status.network_failure}>
            <div class="alert alert-error alert-outline">
              <WifiOff class="w-4 h-4" />
              <span>Network failure occurred while checking for updates.</span>
            </div>
          </Show>

          {/* Apps with Issues */}
          <Show when={props.status.apps_with_issues?.length > 0}>
            <div class="space-y-2">
              <h4 class="font-semibold">Apps with Issues:</h4>
              <div class="overflow-x-auto">
                <table class="table table-zebra w-full">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Installed</th>
                      <th>Latest</th>
                      <th>Status</th>
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
                              <div class="badge badge-sm badge-warning">Held package</div>
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
                              <div class="badge badge-sm badge-success">Update Available</div>
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
              <span>Scoop is up to date and all packages are in good condition!</span>
            </div>
          </Show>
        </div>
      </Show>
    </Modal>
  );
}

export default ScoopStatusModal;
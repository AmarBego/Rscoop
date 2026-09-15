import { createEffect, createMemo, createSignal, on, onCleanup, onMount, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { manifestReview, type ManifestReviewTarget, type ManifestUpdate } from "../stores/manifestReview";
import operationsStore from "../stores/operations";
import installedPackagesStore from "../stores/installedPackagesStore";
import type { ScoopInfo, ScoopPackage } from "../types/scoop";
import { getErrorMessage } from "../utils/errors";
import PackageInfoModal from "./PackageInfoModal";

export default function ManifestReviewHost(props: { ready: boolean }) {
  const [info, setInfo] = createSignal<ScoopInfo | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(false);
  const unlisteners: UnlistenFn[] = [];
  let disposed = false;
  const consume = async () => {
    if (!props.ready || disposed) return;
    try {
      const target = await invoke<ManifestReviewTarget | null>("consume_pending_manifest_review");
      if (!target || disposed) return;
      operationsStore.minimize();
      await manifestReview.open(target);
    } catch (err) { console.error("Failed to open manifest review:", getErrorMessage(err)); }
  };
  onMount(async () => {
    for (const [name, handler] of [
      ["manifest-review-requested", () => void consume()],
      ["manifest-upstream-updated", (event: { payload: ManifestUpdate }) => manifestReview.publish(event.payload)],
    ] as const) {
      try {
        const unlisten = await listen<ManifestUpdate>(name, handler);
        if (disposed) unlisten(); else unlisteners.push(unlisten);
      } catch (err) { console.error("Failed to listen for manifest updates:", getErrorMessage(err)); }
    }
    await consume();
  });
  createEffect(() => { if (props.ready) void consume(); });
  onCleanup(() => { disposed = true; unlisteners.forEach(unlisten => unlisten()); });

  const pkg = createMemo<ScoopPackage | null>(() => {
    const target = manifestReview.target();
    if (!target) return null;
    return { name: target.packageName, source: target.bucket, version: "", updated: "", info: "", match_source: "name",
      is_installed: installedPackagesStore.packages().some(item => item.name === target.packageName) };
  });
  createEffect(on(manifestReview.target, async target => {
    setInfo(null); setError(null); setLoading(!!target);
    if (!target) return;
    try {
      const result = await invoke<ScoopInfo>("get_package_info", { packageName: target.packageName, bucket: target.bucket });
      if (manifestReview.target()?.id === target.id) setInfo(result);
    } catch (err) {
      if (manifestReview.target()?.id === target.id) setError(getErrorMessage(err));
    } finally {
      if (manifestReview.target()?.id === target.id) setLoading(false);
    }
  }));
  return <Show when={props.ready}>
    <PackageInfoModal pkg={pkg()} info={info()} loading={loading()} error={error()} onClose={manifestReview.close}
      initialTab="manifest" reviewRequest={manifestReview.target()?.id} reviewOnly />
  </Show>;
}

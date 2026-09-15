import { createSignal } from "solid-js";

export interface ManifestReviewTarget { packageName: string; bucket: string }
export interface ManifestUpdate { bucket: string | null; conflicts: ManifestReviewTarget[] }
type DialogHandler = (target: ManifestReviewTarget) => Promise<boolean>;

const [target, setTarget] = createSignal<(ManifestReviewTarget & { id: number }) | null>(null);
const [update, setUpdate] = createSignal<ManifestUpdate | null>(null);
const [conflicts, setConflicts] = createSignal<ManifestReviewTarget[]>([]);
let activeDialog: DialogHandler | undefined;
let sequence = 0;
let navigating = false;

export const manifestReview = {
  target, update, conflicts,
  close: () => setTarget(null),
  resolve(target: ManifestReviewTarget) {
    setConflicts(previous => previous.filter(item => item.bucket !== target.bucket || item.packageName !== target.packageName));
  },
  registerDialog(handler: DialogHandler) {
    activeDialog = handler;
    return () => { if (activeDialog === handler) activeDialog = undefined; };
  },
  async open(next: ManifestReviewTarget) {
    if (navigating) return;
    navigating = true;
    try {
      // An open dialog can handle the same target in place, or veto navigation
      // while saving / when the user chooses to keep an unsaved draft.
      if (activeDialog && !await activeDialog(next)) return;
      setTarget({ ...next, id: ++sequence });
    } finally { navigating = false; }
  },
  publish(event: ManifestUpdate) {
    setConflicts(previous => event.bucket === null ? event.conflicts : [
      ...previous.filter(item => item.bucket !== event.bucket), ...event.conflicts,
    ]);
    setUpdate(event);
  },
};

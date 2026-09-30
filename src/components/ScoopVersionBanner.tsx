import { createSignal, onMount, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { TriangleAlert, X } from "lucide-solid";
import Modal from "./common/Modal";
import { useI18n } from "../i18n";
import { getErrorMessage } from "../utils/errors";

const DISMISSED_FOR_KEY = "scoop.legacyWarningDismissedFor";
const RELEASE_URL = "https://github.com/ScoopInstaller/Scoop/releases/tag/v0.6.0";

interface ScoopVersionInfo {
  version: string | null;
  isLegacy: boolean;
}

export default function ScoopVersionBanner() {
  const { t } = useI18n();
  const [version, setVersion] = createSignal<string | null>(null);
  const [show, setShow] = createSignal(false);
  const [modalOpen, setModalOpen] = createSignal(false);

  onMount(async () => {
    try {
      const info = await invoke<ScoopVersionInfo>("get_scoop_version");
      if (!info.isLegacy || !info.version) return;

      const dismissedFor = await invoke<string | null>("get_config_value", { key: DISMISSED_FOR_KEY });
      if (dismissedFor === info.version) return;

      setVersion(info.version);
      setShow(true);
    } catch (e) {
      console.error("ScoopVersionBanner init failed:", getErrorMessage(e));
    }
  });

  async function acknowledgeAndHide() {
    setShow(false);
    setModalOpen(false);
    const v = version();
    if (v) {
      try {
        await invoke("set_config_value", { key: DISMISSED_FOR_KEY, value: v });
      } catch (e) {
        console.error("Failed to save legacy warning dismissal:", getErrorMessage(e));
      }
    }
  }

  return (
    <Show when={show()}>
      <div role="status" class="alert alert-warning alert-soft mb-4 flex items-center gap-3">
        <TriangleAlert class="w-5 h-5 shrink-0" />
        <span class="flex-1 text-sm">
          {t("scoopLegacy.bannerMessage", { version: version() ?? "" })}
        </span>
        <button type="button" class="btn btn-sm btn-warning" onClick={() => setModalOpen(true)}>
          {t("scoopLegacy.details")}
        </button>
        <button
          type="button"
          class="btn btn-sm btn-ghost btn-square"
          onClick={acknowledgeAndHide}
          aria-label={t("common.dismiss")}
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <Modal
        isOpen={modalOpen()}
        onClose={() => setModalOpen(false)}
        title={t("scoopLegacy.modalTitle", { version: version() ?? "" })}
        size="medium"
        footer={
          <>
            <button type="button" class="btn btn-ghost" onClick={acknowledgeAndHide}>
              {t("common.dismiss")}
            </button>
            <button
              type="button"
              class="btn btn-primary"
              onClick={() => openUrl(RELEASE_URL).catch(err => console.error("Failed to open URL:", getErrorMessage(err)))}
            >
              {t("scoopLegacy.viewRelease")}
            </button>
          </>
        }
      >
        <p class="text-sm leading-relaxed">
          {t("scoopLegacy.body", { version: version() ?? "" })}
        </p>
        <p class="text-sm leading-relaxed mt-3">
          {t("scoopLegacy.updateHint")}
        </p>
      </Modal>
    </Show>
  );
}

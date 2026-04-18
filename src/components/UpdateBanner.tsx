import { createSignal, onMount, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Sparkles, X } from "lucide-solid";
import { marked } from "marked";
import Modal from "./common/Modal";
import { useI18n } from "../i18n";

const LAST_SEEN_KEY = "app.lastSeenVersion";

export default function UpdateBanner() {
  const { t } = useI18n();
  const [version, setVersion] = createSignal<string | null>(null);
  const [show, setShow] = createSignal(false);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [notesHtml, setNotesHtml] = createSignal<string>("");
  const [loadingNotes, setLoadingNotes] = createSignal(false);

  onMount(async () => {
    try {
      const current = await getVersion();

      const lastSeen = await invoke<string | null>("get_config_value", { key: LAST_SEEN_KEY });
      if (lastSeen === current) return;

      // Missing lastSeen means either a fresh install or an upgrade from a
      // pre-banner version (1.6.1 shipped without this key). Either way, if
      // notes exist for the current version, show them — a new user seeing
      // the changelog once is acceptable UX.
      const notes = await invoke<string | null>("get_release_notes", { version: current });
      if (notes) {
        setVersion(current);
        setShow(true);
      } else {
        // No notes — record so we don't re-check on every launch.
        await invoke("set_config_value", { key: LAST_SEEN_KEY, value: current });
      }
    } catch (e) {
      console.error("UpdateBanner init failed:", e);
    }
  });

  async function acknowledgeAndHide() {
    setShow(false);
    setModalOpen(false);
    const v = version();
    if (v) {
      try {
        await invoke("set_config_value", { key: LAST_SEEN_KEY, value: v });
      } catch (e) {
        console.error("Failed to save lastSeenVersion:", e);
      }
    }
  }

  async function openNotes() {
    setLoadingNotes(true);
    setModalOpen(true);
    try {
      const v = version();
      if (!v) return;
      const md = await invoke<string | null>("get_release_notes", { version: v });
      if (md) {
        // `marked` can return string | Promise<string> depending on config.
        const html = await Promise.resolve(marked.parse(md));
        setNotesHtml(html);
      } else {
        setNotesHtml("<p>No release notes available for this version.</p>");
      }
    } catch (e) {
      console.error("Failed to load release notes:", e);
      setNotesHtml("<p>Failed to load release notes.</p>");
    } finally {
      setLoadingNotes(false);
    }
  }

  return (
    <Show when={show()}>
      <div role="status" class="alert alert-info alert-soft mb-4 flex items-center gap-3">
        <Sparkles class="w-5 h-5 flex-shrink-0" />
        <span class="flex-1 text-sm">
          {t("update.bannerMessage", { version: version() ?? "" })}
        </span>
        <button class="btn btn-sm btn-primary" onClick={openNotes}>
          {t("update.whatsNew")}
        </button>
        <button
          class="btn btn-sm btn-ghost btn-square"
          onClick={acknowledgeAndHide}
          aria-label={t("common.dismiss")}
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <Modal
        isOpen={modalOpen()}
        onClose={acknowledgeAndHide}
        title={t("update.modalTitle", { version: version() ?? "" })}
        size="medium"
      >
        <Show
          when={!loadingNotes()}
          fallback={<div class="py-8 text-center text-base-content/60">{t("common.loading")}</div>}
        >
          {/* Content is our own bundled RELEASE_NOTES.md rendered by `marked`,
              no user input reaches this. Typography plugin isn't installed
              so we style inline. Link clicks bubble up to the container and
              we route them through the OS via plugin-opener so they don't
              navigate the webview. */}
          <div
            class="release-notes-body"
            innerHTML={notesHtml()}
            onClick={(e) => {
              const anchor = (e.target as HTMLElement).closest("a");
              if (!anchor) return;
              const href = anchor.getAttribute("href");
              if (!href || href.startsWith("#")) return;
              e.preventDefault();
              openUrl(href).catch(err => console.error("Failed to open URL:", err));
            }}
          />
          <style>{`
            .release-notes-body h4 {
              font-size: 1rem;
              font-weight: 600;
              margin-top: 1.25rem;
              margin-bottom: 0.5rem;
              color: var(--color-primary, currentColor);
            }
            .release-notes-body h4:first-child { margin-top: 0; }
            .release-notes-body ul {
              list-style: disc;
              padding-left: 1.25rem;
              margin: 0.25rem 0 0.5rem;
            }
            .release-notes-body li { margin: 0.25rem 0; line-height: 1.5; }
            .release-notes-body p { margin: 0.5rem 0; line-height: 1.5; }
            .release-notes-body a {
              color: var(--color-primary, currentColor);
              text-decoration: underline;
            }
            .release-notes-body a:hover { opacity: 0.8; }
            .release-notes-body strong { font-weight: 600; }
            .release-notes-body code {
              background: var(--color-base-200, rgba(128,128,128,0.15));
              padding: 1px 5px;
              border-radius: 3px;
              font-size: 0.875em;
            }
          `}</style>
        </Show>
      </Modal>
    </Show>
  );
}

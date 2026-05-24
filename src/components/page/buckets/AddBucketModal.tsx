import { createSignal, createUniqueId, Show } from "solid-js";
import { useBucketInstall } from "../../../hooks/useBucketInstall";
import Modal from "../../common/Modal";
import { useI18n } from "../../../i18n";

interface AddBucketModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBucketAdded: () => void;
}

function AddBucketModal(props: AddBucketModalProps) {
  const { t } = useI18n();
  const formId = createUniqueId();
  const urlId = createUniqueId();
  const nameId = createUniqueId();
  const [url, setUrl] = createSignal("");
  const [name, setName] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [success, setSuccess] = createSignal<string | null>(null);

  const bucketInstall = useBucketInstall();

  const handleSubmit = async (event?: SubmitEvent) => {
    event?.preventDefault();
    const urlValue = url().trim();
    if (!urlValue) {
      setError(t("buckets.addModalUrlRequired"));
      return;
    }

    setError(null);
    setSuccess(null);

    try {
      const result = await bucketInstall.installBucket({
        name: name().trim(),
        url: urlValue,
        force: false,
      });

      if (result.success) {
        setSuccess(result.message);
        props.onBucketAdded();
        setTimeout(() => {
          resetAndClose();
        }, 1500);
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : typeof err === "string" ? err : t("common.unknownError"));
    }
  };

  const resetAndClose = () => {
    setUrl("");
    setName("");
    setError(null);
    setSuccess(null);
    props.onClose();
  };

  const isInstalling = () => bucketInstall.state().isInstalling;

  return (
    <Modal
      isOpen={props.isOpen}
      onClose={resetAndClose}
      title={t("buckets.addModalTitle")}
      size="small"
      footer={
        <div class="flex justify-end gap-2 w-full">
          <button type="button" class="btn" onClick={resetAndClose} disabled={isInstalling()}>
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            form={formId}
            class="btn btn-primary"
            disabled={isInstalling() || !url().trim()}
          >
            <Show when={isInstalling()} fallback={t("buckets.addModalSubmit")}>
              <span class="loading loading-spinner loading-sm"></span>
              {t("common.installing")}
            </Show>
          </button>
        </div>
      }
    >
      <form id={formId} onSubmit={handleSubmit}>
      <div class="form-control w-full mb-3">
        <label class="label" for={urlId}>
          <span class="label-text">{t("buckets.addModalUrlLabel")} <span class="text-error">*</span></span>
        </label>
        <input
          id={urlId}
          type="text"
          placeholder={t("buckets.addModalUrlPlaceholder")}
          class="input w-full focus:outline-none focus:border-base-content/20"
          value={url()}
          onInput={(e) => setUrl(e.currentTarget.value)}
          disabled={isInstalling()}
        />
      </div>

      <div class="form-control w-full">
        <label class="label" for={nameId}>
          <span class="label-text">{t("buckets.addModalNameLabel")} <span class="text-base-content/50">{t("buckets.addModalNameOptional")}</span></span>
        </label>
        <input
          id={nameId}
          type="text"
          placeholder={t("buckets.addModalNamePlaceholder")}
          class="input w-full focus:outline-none focus:border-base-content/20"
          value={name()}
          onInput={(e) => setName(e.currentTarget.value)}
          disabled={isInstalling()}
        />
      </div>

      <Show when={error()}>
        <div class="alert alert-error mt-4">
          <span>{error()}</span>
        </div>
      </Show>

      <Show when={success()}>
        <div class="alert alert-success mt-4">
          <span>{success()}</span>
        </div>
      </Show>
      </form>
    </Modal>
  );
}

export default AddBucketModal;

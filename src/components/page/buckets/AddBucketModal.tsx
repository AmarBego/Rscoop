import { createSignal, Show } from "solid-js";
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
  const [url, setUrl] = createSignal("");
  const [name, setName] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [success, setSuccess] = createSignal<string | null>(null);

  const bucketInstall = useBucketInstall();

  const handleSubmit = async () => {
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
      setError(err instanceof Error ? err.message : "Failed to add bucket");
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
          <button class="btn" onClick={resetAndClose} disabled={isInstalling()}>
            {t("common.cancel")}
          </button>
          <button
            class="btn btn-primary"
            onClick={handleSubmit}
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
      <div class="form-control w-full mb-3">
        <label class="label">
          <span class="label-text">{t("buckets.addModalUrlLabel")} <span class="text-error">*</span></span>
        </label>
        <input
          type="text"
          placeholder={t("buckets.addModalUrlPlaceholder")}
          class="input input-bordered w-full"
          value={url()}
          onInput={(e) => setUrl(e.currentTarget.value)}
          disabled={isInstalling()}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !isInstalling()) handleSubmit();
          }}
        />
      </div>

      <div class="form-control w-full">
        <label class="label">
          <span class="label-text">{t("buckets.addModalNameLabel")} <span class="text-base-content/50">{t("buckets.addModalNameOptional")}</span></span>
        </label>
        <input
          type="text"
          placeholder={t("buckets.addModalNamePlaceholder")}
          class="input input-bordered w-full"
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
    </Modal>
  );
}

export default AddBucketModal;

import { createSignal, Show } from "solid-js";
import { useBucketInstall } from "../../../hooks/useBucketInstall";
import Modal from "../../common/Modal";

interface AddBucketModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBucketAdded: () => void;
}

function AddBucketModal(props: AddBucketModalProps) {
  const [url, setUrl] = createSignal("");
  const [name, setName] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [success, setSuccess] = createSignal<string | null>(null);

  const bucketInstall = useBucketInstall();

  const handleSubmit = async () => {
    const urlValue = url().trim();
    if (!urlValue) {
      setError("Please enter a bucket URL");
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
      title="Add Custom Bucket"
      size="small"
      footer={
        <div class="flex justify-end gap-2 w-full">
          <button class="btn" onClick={resetAndClose} disabled={isInstalling()}>
            Cancel
          </button>
          <button
            class="btn btn-primary"
            onClick={handleSubmit}
            disabled={isInstalling() || !url().trim()}
          >
            <Show when={isInstalling()} fallback="Add Bucket">
              <span class="loading loading-spinner loading-sm"></span>
              Installing...
            </Show>
          </button>
        </div>
      }
    >
      <div class="form-control w-full mb-3">
        <label class="label">
          <span class="label-text">Repository URL <span class="text-error">*</span></span>
        </label>
        <input
          type="text"
          placeholder="https://github.com/user/scoop-bucket"
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
          <span class="label-text">Bucket Name <span class="text-base-content/50">(optional)</span></span>
        </label>
        <input
          type="text"
          placeholder="Auto-detected from URL"
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

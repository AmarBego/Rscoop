import { createSignal, createUniqueId, Show } from "solid-js";
import { Plus } from "lucide-solid";
import { useI18n } from "../../../i18n";
import Modal from "../../common/Modal";

interface AddShimModalProps {
    onClose: () => void;
    onAdd: (name: string, path: string, args: string, global: boolean) => void | Promise<void>;
    isOperationRunning: boolean;
    error?: string | null;
}

function AddShimModal(props: AddShimModalProps) {
    const { t } = useI18n();
    const formId = createUniqueId();
    const nameId = createUniqueId();
    const pathId = createUniqueId();
    const argsId = createUniqueId();
    const argsHintId = createUniqueId();
    const [name, setName] = createSignal("");
    const [path, setPath] = createSignal("");
    const [args, setArgs] = createSignal("");
    const [isGlobal, setIsGlobal] = createSignal(false);

    const handleAdd = (e: SubmitEvent) => {
        e.preventDefault();
        if (name() && path()) {
            props.onAdd(name(), path(), args(), isGlobal());
        }
    };

    return (
        <Modal
            isOpen={true}
            onClose={props.onClose}
            title={t("doctor.shimAddTitle")}
            size="medium"
            footer={
                <button
                    type="submit"
                    form={formId}
                    class="btn btn-primary"
                    disabled={!name() || !path() || props.isOperationRunning}
                >
                    <Plus class="w-4 h-4" aria-hidden="true" /> {t("doctor.shimAddSubmit")}
                </button>
            }
        >
            <form id={formId} class="space-y-3" onSubmit={handleAdd}>
                <Show when={props.error}>
                    <div role="alert" class="alert alert-error text-sm">
                        <span>{props.error}</span>
                    </div>
                </Show>
                <div class="form-control w-full">
                    <label class="label" for={nameId}><span class="label-text">{t("doctor.shimAddNameLabel")}</span></label>
                    <input
                        id={nameId}
                        type="text"
                        placeholder={t("doctor.shimAddNamePlaceholder")}
                        class="input w-full focus:outline-none focus:border-base-content/20"
                        value={name()}
                        onInput={(e) => setName(e.currentTarget.value)}
                        disabled={props.isOperationRunning}
                    />
                </div>
                <div class="form-control w-full">
                    <label class="label" for={pathId}><span class="label-text">{t("doctor.shimAddPathLabel")}</span></label>
                    <input
                        id={pathId}
                        type="text"
                        placeholder={t("doctor.shimAddPathPlaceholder")}
                        class="input w-full focus:outline-none focus:border-base-content/20"
                        value={path()}
                        onInput={(e) => setPath(e.currentTarget.value)}
                        disabled={props.isOperationRunning}
                    />
                </div>
                <div class="form-control w-full">
                    <label class="label" for={argsId}><span class="label-text">{t("doctor.shimAddArgsLabel")}</span></label>
                    <input
                        id={argsId}
                        type="text"
                        placeholder={t("doctor.shimAddArgsPlaceholder")}
                        class="input w-full focus:outline-none focus:border-base-content/20"
                        value={args()}
                        onInput={(e) => setArgs(e.currentTarget.value)}
                        aria-describedby={argsHintId}
                        disabled={props.isOperationRunning}
                    />
                    <label class="label" id={argsHintId}><span class="label-text-alt">{t("doctor.shimAddArgsHint")}</span></label>
                </div>
                
                <div class="form-control">
                    <label class="label cursor-pointer">
                        <span class="label-text">{t("doctor.shimAddGlobal")}</span>
                        <input
                            type="checkbox"
                            class="toggle toggle-primary"
                            checked={isGlobal()}
                            onChange={(e) => setIsGlobal(e.currentTarget.checked)}
                            disabled={props.isOperationRunning}
                        />
                    </label>
                </div>
            </form>
        </Modal>
    );
}

export default AddShimModal; 

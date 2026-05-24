import { createSignal, Show } from "solid-js";
import { Trash2, Eye, EyeOff } from "lucide-solid";
import { Shim } from "./ShimManager";
import { useI18n } from "../../../i18n";
import Modal from "../../common/Modal";

interface ShimDetailsModalProps {
    shim: Shim;
    onClose: () => void;
    onRemove: (name: string) => void;
    onAlter: (name: string) => void;
    isOperationRunning: boolean;
    error?: string | null;
}

function ShimDetailsModal(props: ShimDetailsModalProps) {
    const { t } = useI18n();
    const [isConfirmingRemove, setIsConfirmingRemove] = createSignal(false);

    const handleRemove = () => {
        setIsConfirmingRemove(false);
        props.onRemove(props.shim.name);
    }

    const handleAlter = () => {
        props.onAlter(props.shim.name);
    }

    return (
        <>
            <Modal
                isOpen={true}
                onClose={props.onClose}
                title={props.shim.name}
                size="medium"
                footer={
                    <div class="flex flex-wrap gap-2 justify-end">
                        <button
                            type="button"
                            class="btn btn-error"
                            onClick={() => {
                                if (isConfirmingRemove()) {
                                    handleRemove();
                                } else {
                                    setIsConfirmingRemove(true);
                                }
                            }}
                            disabled={props.isOperationRunning}
                        >
                            <Trash2 class="w-4 h-4" aria-hidden="true" /> {t("doctor.shimRemove")}
                        </button>
                        <Show when={isConfirmingRemove()}>
                            <button
                                type="button"
                                class="btn btn-ghost"
                                onClick={() => setIsConfirmingRemove(false)}
                                disabled={props.isOperationRunning}
                            >
                                {t("modal.confirmation.cancel")}
                            </button>
                        </Show>
                        <button
                            type="button"
                            class="btn"
                            onClick={handleAlter}
                            disabled={props.isOperationRunning}
                        >
                            <Show when={!props.shim.isHidden} fallback={<><Eye class="w-4 h-4" aria-hidden="true" /> {t("doctor.shimUnhide")}</>}>
                                <EyeOff class="w-4 h-4" aria-hidden="true" /> {t("doctor.shimHide")}
                            </Show>
                        </button>
                    </div>
                }
            >
                <div class="py-4 space-y-3">
                    <Show when={props.error}>
                        <div role="alert" class="alert alert-error text-sm">
                            <span>{props.error}</span>
                        </div>
                    </Show>
                    <Show when={isConfirmingRemove()}>
                        <div role="alert" class="alert alert-warning text-sm">
                            <span>{t("doctor.shimRemoveConfirm", { name: props.shim.name })}</span>
                        </div>
                    </Show>
                    <p class="text-sm  break-all">
                        <span class="font-semibold text-base-content">{t("doctor.shimDetailsSource")} </span> {props.shim.source}
                    </p>
                    <p class="text-sm  break-all">
                        <span class="font-semibold text-base-content">{t("doctor.shimDetailsPath")} </span> {props.shim.path}
                    </p>
                    <Show when={props.shim.args}>
                        <p class="text-sm  break-all">
                            <span class="font-semibold text-base-content">{t("doctor.shimDetailsArguments")} </span>
                            <span class="font-mono bg-base-300 px-1 rounded">{props.shim.args}</span>
                        </p>
                    </Show>
                </div>
            </Modal>
        </>
    );
}

export default ShimDetailsModal; 

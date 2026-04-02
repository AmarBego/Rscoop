import Modal from "./common/Modal";
import { useI18n } from "../i18n";

interface ConfirmationModalProps {
    isOpen: boolean;
    title: string;
    onConfirm: () => void;
    onCancel: () => void;
    confirmText?: string;
    cancelText?: string;
    children: any;
}

function ConfirmationModal(props: ConfirmationModalProps) {
    const { t } = useI18n();
    return (
        <Modal
            isOpen={props.isOpen}
            onClose={props.onCancel}
            title={props.title}
            size="medium"
            footer={
                <>
                    <button class="btn-close-outline" onClick={props.onCancel}>
                        {props.cancelText || t("modal.confirmation.cancel")}
                    </button>
                    <button class="btn btn-error" onClick={props.onConfirm}>
                        {props.confirmText || "Confirm"}
                    </button>
                </>
            }
        >
            <div class="py-4 space-y-2">
                {props.children}
            </div>
        </Modal>
    );
}

export default ConfirmationModal;
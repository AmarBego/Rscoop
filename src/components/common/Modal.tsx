import { Show, JSX, onMount, onCleanup, createEffect } from "solid-js";

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string | JSX.Element;
    size?: "small" | "medium" | "large" | "full";
    showCloseButton?: boolean;
    children: JSX.Element;
    footer?: JSX.Element;
    headerAction?: JSX.Element;
    class?: string;
    preventBackdropClose?: boolean;
}

export default function Modal(props: ModalProps) {
    const getSizeClass = () => {
        switch (props.size) {
            case "small": return "max-w-md";
            case "medium": return "max-w-2xl";
            case "large": return "max-w-5xl";
            case "full": return "w-11/12 max-w-7xl";
            default: return "max-w-2xl";
        }
    };

    // Handle ESC key to close modal
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape" && props.isOpen) {
            props.onClose();
        }
    };

    onMount(() => {
        document.addEventListener("keydown", handleKeyDown);
    });

    onCleanup(() => {
        document.removeEventListener("keydown", handleKeyDown);
    });

    // Prevent body scroll when modal is open
    createEffect(() => {
        if (props.isOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
    });

    const handleBackdropClick = () => {
        if (!props.preventBackdropClose) {
            props.onClose();
        }
    };

    return (
        <Show when={props.isOpen}>
            <div class="modal modal-open backdrop-blur-sm" role="dialog">
                <div class={`modal-box bg-base-300 shadow-2xl border border-base-300 p-0 overflow-hidden flex flex-col max-h-[90vh] ${getSizeClass()} ${props.class ?? ""}`}>
                    {/* Header */}
                    <div class="flex justify-between items-center p-4 border-b border-base-200 bg-base-400">
                        <h3 class="font-bold text-lg">{props.title}</h3>
                        <div class="flex items-center gap-2">
                            <Show when={props.headerAction}>
                                {props.headerAction}
                            </Show>
                            <Show when={props.showCloseButton !== false}>
                                <button
                                    class="btn btn-sm btn-circle btn-ghost"
                                    onClick={props.onClose}
                                    aria-label="Close"
                                >
                                    ✕
                                </button>
                            </Show>
                        </div>
                    </div>

                    {/* Content */}
                    <div class="p-6 overflow-y-auto flex-1">
                        {props.children}
                    </div>

                    {/* Footer */}
                    <Show when={props.footer}>
                        <div class="modal-action p-4 border-t border-base-300 bg-base-300 shrink-0 mt-0">
                            {props.footer}
                        </div>
                    </Show>
                </div>
                <div class="modal-backdrop" onClick={handleBackdropClick}></div>
            </div>
        </Show>
    );
}

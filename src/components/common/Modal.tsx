import { Show, JSX, onMount, onCleanup, createEffect, createUniqueId } from "solid-js";
import { useI18n } from "../../i18n";

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
    contentClass?: string;
    preventBackdropClose?: boolean;
}

const FOCUSABLE_SELECTOR = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "textarea:not([disabled])",
    "select:not([disabled])",
    '[tabindex]:not([tabindex="-1"])',
].join(",");

export default function Modal(props: ModalProps) {
    const { t } = useI18n();
    let dialogRef: HTMLDivElement | undefined;
    let previouslyFocused: HTMLElement | null = null;
    const titleId = createUniqueId();

    const getSizeClass = () => {
        switch (props.size) {
            case "small": return "max-w-md";
            case "medium": return "max-w-2xl";
            case "large": return "max-w-5xl";
            case "full": return "w-11/12 max-w-7xl";
            default: return "max-w-2xl";
        }
    };

    const getFocusable = (): HTMLElement[] => {
        if (!dialogRef) return [];
        return Array.from(dialogRef.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
            .filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        if (!props.isOpen) return;
        if (e.key === "Escape") {
            e.stopPropagation();
            props.onClose();
            return;
        }
        if (e.key === "Tab" && dialogRef) {
            const focusable = getFocusable();
            if (focusable.length === 0) {
                e.preventDefault();
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            const active = document.activeElement as HTMLElement | null;
            if (e.shiftKey) {
                if (active === first || !dialogRef.contains(active)) {
                    e.preventDefault();
                    last.focus();
                }
            } else {
                if (active === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        }
    };

    onMount(() => {
        document.addEventListener("keydown", handleKeyDown);
    });

    onCleanup(() => {
        document.removeEventListener("keydown", handleKeyDown);
        document.body.style.overflow = "";
    });

    createEffect(() => {
        if (props.isOpen) {
            previouslyFocused = document.activeElement as HTMLElement | null;
            document.body.style.overflow = "hidden";
            // Focus the dialog container itself (tabindex=-1) rather than the first
            // focusable element. Auto-focusing a button can have side effects (e.g.
            // DaisyUI dropdowns open on focus). Tab key proceeds from here into content.
            queueMicrotask(() => dialogRef?.focus());
        } else {
            document.body.style.overflow = "";
            previouslyFocused?.focus?.();
            previouslyFocused = null;
        }
    });

    const handleBackdropClick = () => {
        if (!props.preventBackdropClose) {
            props.onClose();
        }
    };

    return (
        <Show when={props.isOpen}>
            <div class="modal modal-open" role="presentation">
                <div
                    ref={dialogRef}
                    class={`modal-box bg-base-300 shadow-2xl border border-base-300 p-0 overflow-hidden flex flex-col max-h-[90vh] ${getSizeClass()} ${props.class ?? ""}`}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={titleId}
                    tabindex="-1"
                >
                    {/* Header */}
                    <div class="flex justify-between items-center p-4 border-b border-base-200 bg-base-400">
                        <h3 id={titleId} class="font-bold text-lg">{props.title}</h3>
                        <div class="flex items-center gap-2">
                            <Show when={props.headerAction}>
                                {props.headerAction}
                            </Show>
                            <Show when={props.showCloseButton !== false}>
                                <button
                                    type="button"
                                    class="btn btn-sm btn-circle btn-ghost"
                                    onClick={props.onClose}
                                    aria-label={t("common.close")}
                                >
                                    ✕
                                </button>
                            </Show>
                        </div>
                    </div>

                    {/* Content */}
                    <div class={`p-6 overflow-y-auto flex-1 ${props.contentClass ?? ""}`}>
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

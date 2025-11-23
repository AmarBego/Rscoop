import { Show } from "solid-js";
import { X, Trash2, Eye, EyeOff } from "lucide-solid";
import { Shim } from "./ShimManager";

interface ShimDetailsModalProps {
    shim: Shim;
    onClose: () => void;
    onRemove: (name: string) => void;
    onAlter: (name: string) => void;
    isOperationRunning: boolean;
}

function ShimDetailsModal(props: ShimDetailsModalProps) {
    const handleRemove = () => {
        props.onRemove(props.shim.name);
    }

    const handleAlter = () => {
        props.onAlter(props.shim.name);
    }

    return (
        <div class="modal modal-open" role="dialog">
            <div class="modal-box bg-base-200">
                <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" onClick={props.onClose}>
                    <X />
                </button>
                <h3 class="font-bold text-lg text-primary">{props.shim.name}</h3>

                <div class="py-4 space-y-3">
                    <p class="text-sm  break-all">
                        <span class="font-semibold text-base-content">Source: </span> {props.shim.source}
                    </p>
                    <p class="text-sm  break-all">
                        <span class="font-semibold text-base-content">Path: </span> {props.shim.path}
                    </p>
                    <Show when={props.shim.args}>
                        <p class="text-sm  break-all">
                            <span class="font-semibold text-base-content">Arguments: </span>
                            <span class="font-mono bg-base-300 px-1 rounded">{props.shim.args}</span>
                        </p>
                    </Show>
                </div>

                <div class="modal-action">
                    <button class="btn btn-error" onClick={handleRemove} disabled={props.isOperationRunning}>
                        <Trash2 class="w-4 h-4" /> Remove
                    </button>
                    <button class="btn" onClick={handleAlter} disabled={props.isOperationRunning}>
                        <Show when={!props.shim.isHidden} fallback={<><Eye class="w-4 h-4" /> Unhide</>}>
                            <EyeOff class="w-4 h-4" /> Hide
                        </Show>
                    </button>
                </div>
            </div>
            <div class="modal-backdrop" onClick={props.onClose}></div>
        </div>
    );
}

export default ShimDetailsModal; 
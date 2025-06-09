import { Show } from "solid-js";
import type { Shim } from "./ShimManager"; 
import { Trash2, X, Globe, EyeOff, Link, Edit } from "lucide-solid";

interface ShimDetailsModalProps {
    shim: Shim;
    onClose: () => void;
    onRemove: (shimName: string) => void;
    onAlter: (shimName: string) => void;
    isOperationRunning: boolean;
}

function ShimDetailsModal(props: ShimDetailsModalProps) {
    const stopPropagation = (e: MouseEvent) => e.stopPropagation();

    return (
        <dialog class="modal modal-open backdrop-blur-sm" onClick={props.onClose}>
            <div class="modal-box bg-base-200" onClick={stopPropagation}>
                <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" onClick={props.onClose}><X /></button>
                <h3 class="font-bold text-lg">
                    {props.shim.name}
                </h3>
                <div class="py-4 space-y-2">
                    <div>
                        <label class="block text-sm font-medium text-base-content/70">Path</label>
                        <p class="font-mono text-sm break-all">{props.shim.path}</p>
                    </div>
                     <div>
                        <label class="block text-sm font-medium text-base-content/70">Source</label>
                         <div class="flex items-center gap-2">
                            <Link class="w-4 h-4 text-base-content/60" />
                            {props.shim.source}
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-base-content/70">Type</label>
                        <p>{props.shim.shimType}</p>
                    </div>
                     <div class="flex gap-2 pt-2">
                        <Show when={props.shim.isGlobal}>
                            <div class="badge badge-info gap-1"><Globe class="w-3 h-3"/>Global</div>
                        </Show>
                        <Show when={props.shim.isHidden}>
                                <div class="badge badge-ghost gap-1"><EyeOff class="w-3 h-3"/>Hidden</div>
                        </Show>
                    </div>
                </div>
                <div class="modal-action">
                    <button
                        class="btn btn-primary"
                        onClick={() => props.onAlter(props.shim.name)}
                        disabled={props.isOperationRunning}
                    >
                        <Edit class="w-4 h-4" /> Alter
                    </button>
                    <button
                        class="btn btn-error"
                        onClick={() => props.onRemove(props.shim.name)}
                        disabled={props.isOperationRunning}
                    >
                        <Trash2 class="w-4 h-4" /> Remove
                    </button>
                </div>
            </div>
        </dialog>
    );
}

export default ShimDetailsModal; 
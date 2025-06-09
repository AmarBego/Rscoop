import { createSignal } from "solid-js";
import { X, Plus } from "lucide-solid";

interface AddShimModalProps {
    onClose: () => void;
    onAdd: (name: string, path: string, args: string, global: boolean) => void;
    isOperationRunning: boolean;
}

function AddShimModal(props: AddShimModalProps) {
    const [name, setName] = createSignal("");
    const [path, setPath] = createSignal("");
    const [args, setArgs] = createSignal("");
    const [isGlobal, setIsGlobal] = createSignal(false);

    const stopPropagation = (e: MouseEvent) => e.stopPropagation();
    
    const handleAdd = () => {
        if (name() && path()) {
            props.onAdd(name(), path(), args(), isGlobal());
        }
    };

    return (
        <dialog class="modal modal-open backdrop-blur-sm" onClick={props.onClose}>
            <div class="modal-box" onClick={stopPropagation}>
                <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" onClick={props.onClose}><X /></button>
                <h3 class="font-bold text-lg mb-4">Add a new Shim</h3>

                <div class="form-control w-full">
                    <label class="label"><span class="label-text">Shim Name</span></label>
                    <input type="text" placeholder="e.g. my-app" class="input input-bordered w-full" 
                        value={name()} onInput={(e) => setName(e.currentTarget.value)} />
                </div>
                 <div class="form-control w-full">
                    <label class="label"><span class="label-text">Command Path</span></label>
                    <input type="text" placeholder="e.g. C:\\path\\to\\my-app.exe" class="input input-bordered w-full"
                         value={path()} onInput={(e) => setPath(e.currentTarget.value)} />
                </div>
                 <div class="form-control w-full">
                    <label class="label"><span class="label-text">Arguments</span></label>
                    <input type="text" placeholder="--foo --bar" class="input input-bordered w-full"
                        value={args()} onInput={(e) => setArgs(e.currentTarget.value)} />
                     <label class="label"><span class="label-text-alt">Arguments to pass to the executable.</span></label>
                </div>
                
                 <div class="form-control">
                    <label class="label cursor-pointer">
                        <span class="label-text">Global Shim</span>
                        <input type="checkbox" class="toggle toggle-primary" checked={isGlobal()} onChange={(e) => setIsGlobal(e.currentTarget.checked)} />
                    </label>
                </div>

                <div class="modal-action">
                    <button class="btn btn-primary" onClick={handleAdd} disabled={!name() || !path() || props.isOperationRunning}>
                        <Plus class="w-4 h-4" /> Add Shim
                    </button>
                </div>
            </div>
        </dialog>
    );
}

export default AddShimModal; 
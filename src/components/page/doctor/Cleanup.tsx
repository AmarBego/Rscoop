import { Trash2, Archive } from "lucide-solid";

interface CleanupProps {
    onCleanupApps: () => void;
    onCleanupCache: () => void;
}

function Cleanup(props: CleanupProps) {
    return (
        <div class="card bg-base-200 shadow-xl">
            <div class="card-body">
                <h2 class="card-title text-xl">
                    System Cleanup
                </h2>
                <p class="text-base-content/80 mb-4">
                    Free up disk space by removing old package versions and outdated download caches (this will ignore auto-cleanup constraints).
                </p>
                <div class="card-actions justify-start mt-2">
                    <button class="btn btn-primary" onClick={props.onCleanupApps}>
                        <Trash2 class="w-4 h-4 mr-2" />
                        Cleanup Old Versions
                    </button>
                    <button class="btn btn-secondary" onClick={props.onCleanupCache}>
                        <Archive class="w-4 h-4 mr-2" />
                        Cleanup Outdated Cache
                    </button>
                </div>
            </div>
        </div>
    );
}

export default Cleanup; 
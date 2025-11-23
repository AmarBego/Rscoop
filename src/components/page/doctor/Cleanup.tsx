import { Trash2, Archive } from "lucide-solid";
import Card from "../../common/Card";

interface CleanupProps {
    onCleanupApps: () => void;
    onCleanupCache: () => void;
}

function Cleanup(props: CleanupProps) {
    return (
        <Card
            title="System Cleanup"
            description="Free up disk space by removing old package versions and outdated download caches (this will ignore auto-cleanup constraints)."
        >
            <div class="flex gap-2 mt-2">
                <button class="btn btn-primary" onClick={props.onCleanupApps}>
                    <Trash2 class="w-4 h-4 mr-2" />
                    Cleanup Old Versions
                </button>
                <button class="btn btn-secondary" onClick={props.onCleanupCache}>
                    <Archive class="w-4 h-4 mr-2" />
                    Cleanup Outdated Cache
                </button>
            </div>
        </Card>
    );
}

export default Cleanup;
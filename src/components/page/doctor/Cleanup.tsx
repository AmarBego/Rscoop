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
            description="Remove old package versions and outdated caches to free disk space. Ignores auto-cleanup constraints."
        >
            <div class="flex gap-2">
                <button class="btn btn-sm btn-outline" onClick={props.onCleanupApps}>
                    <Trash2 class="w-3.5 h-3.5" />
                    Old Versions
                </button>
                <button class="btn btn-sm btn-outline" onClick={props.onCleanupCache}>
                    <Archive class="w-3.5 h-3.5" />
                    Outdated Cache
                </button>
            </div>
        </Card>
    );
}

export default Cleanup;

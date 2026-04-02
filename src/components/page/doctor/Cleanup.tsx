import { Trash2, Archive } from "lucide-solid";
import Card from "../../common/Card";
import { useI18n } from "../../../i18n";

interface CleanupProps {
    onCleanupApps: () => void;
    onCleanupCache: () => void;
}

function Cleanup(props: CleanupProps) {
    const { t } = useI18n();
    return (
        <Card
            title={t("doctor.cleanupTitle")}
            description={t("doctor.cleanupDescription")}
        >
            <div class="flex gap-2">
                <button class="btn btn-sm btn-outline" onClick={props.onCleanupApps}>
                    <Trash2 class="w-3.5 h-3.5" />
                    {t("doctor.cleanupOldVersions")}
                </button>
                <button class="btn btn-sm btn-outline" onClick={props.onCleanupCache}>
                    <Archive class="w-3.5 h-3.5" />
                    {t("doctor.cleanupOutdatedCache")}
                </button>
            </div>
        </Card>
    );
}

export default Cleanup;

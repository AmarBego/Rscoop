import { createSignal } from "solid-js";
import { Package, Upload, Download } from "lucide-solid";
import Card from "../../common/Card";
import ExportProfileModal from "./ExportProfileModal";
import ImportProfileModal from "./ImportProfileModal";
import { useI18n } from "../../../i18n";

export default function ExportImportSettings() {
    const { t } = useI18n();
    const [exportOpen, setExportOpen] = createSignal(false);
    const [importOpen, setImportOpen] = createSignal(false);

    return (
        <>
            <Card
                title={t("settings.exim.title")}
                icon={Package}
                description={t("settings.exim.description")}
            >
                <div class="flex flex-wrap gap-2">
                    <button
                        class="btn btn-primary btn-sm"
                        onClick={() => setExportOpen(true)}
                    >
                        <Upload class="w-4 h-4" />
                        {t("settings.exim.exportButton")}
                    </button>
                    <button
                        class="btn btn-sm"
                        onClick={() => setImportOpen(true)}
                    >
                        <Download class="w-4 h-4" />
                        {t("settings.exim.importButton")}
                    </button>
                </div>
            </Card>

            <ExportProfileModal
                isOpen={exportOpen()}
                onClose={() => setExportOpen(false)}
            />
            <ImportProfileModal
                isOpen={importOpen()}
                onClose={() => setImportOpen(false)}
            />
        </>
    );
}

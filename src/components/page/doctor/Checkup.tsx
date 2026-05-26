import { For, Show } from "solid-js";
import { CircleCheckBig, CircleX, TriangleAlert, RefreshCw, Download, ExternalLink } from "lucide-solid";
import Card from "../../common/Card";
import { useI18n } from "../../../i18n";

export type CheckupFix =
    | { kind: "install-package"; label: string; package: string }
    | { kind: "install-bucket"; label: string; name: string; url: string }
    | { kind: "open-settings"; label: string; page: string };

export interface CheckupItem {
    id: string | null;
    status: boolean;
    text: string;
    suggestion: string | null;
    fix: CheckupFix | null;
}

interface CheckupProps {
    checkupResult: CheckupItem[];
    isLoading: boolean;
    error: string | null;
    onRerun: () => void;
    onRunFix: (item: CheckupItem) => void;
    runningFix: string | null;
}

export function checkupFixKey(item: CheckupItem): string {
    const fix = item.fix;
    if (!fix) return item.text;
    switch (fix.kind) {
        case "install-package":
            return `install-package:${fix.package}`;
        case "install-bucket":
            return `install-bucket:${fix.name}`;
        case "open-settings":
            return `open-settings:${fix.page}`;
    }
}

function FixIcon(props: { fix: CheckupFix }) {
    switch (props.fix.kind) {
        case "install-package":
        case "install-bucket":
            return <Download class="w-3 h-3 mr-1" />;
        case "open-settings":
            return <ExternalLink class="w-3 h-3 mr-1" />;
    }
}

function Checkup(props: CheckupProps) {
    const { t } = useI18n();
    return (
        <Card
            title={t("doctor.checkupTitle")}
            headerAction={
                <button
                    type="button"
                    class="btn btn-ghost btn-sm"
                    onClick={props.onRerun}
                    disabled={props.isLoading}
                    aria-label={t("common.refresh")}
                >
                    <RefreshCw classList={{ "animate-spin": props.isLoading }} aria-hidden="true" />
                </button>
            }
            description={t("doctor.checkupDescription")}
        >
            <Show when={props.isLoading && props.checkupResult.length === 0}>
                <div class="flex justify-center p-8">
                    <span class="loading loading-dots loading-lg"></span>
                </div>
            </Show>

            <Show when={props.error}>
                <div class="alert alert-error text-sm">
                    <TriangleAlert class="w-5 h-5" aria-hidden="true" />
                    <span>{props.error}</span>
                </div>
            </Show>

            <Show when={!props.error && props.checkupResult.length > 0}>
                <ul class="space-y-3">
                    <For each={props.checkupResult}>
                        {(item) => (
                            <li class="p-3 bg-base-100 rounded-lg">
                                <div class="flex items-center">
                                    <Show when={item.status} fallback={<CircleX class="w-5 h-5 mr-3 text-error" />}>
                                        <CircleCheckBig class="w-5 h-5 mr-3 text-success" />
                                    </Show>
                                    <span class="flex-grow">{item.text}</span>
                                    <Show when={item.fix && !item.status}>
                                        <button
                                            type="button"
                                            class="btn btn-xs btn-outline btn-primary"
                                            onClick={() => props.onRunFix(item)}
                                            disabled={!!props.runningFix}
                                        >
                                            <Show when={props.runningFix === checkupFixKey(item)} fallback={
                                                <>
                                                    <FixIcon fix={item.fix!} />
                                                    {item.fix!.label}
                                                </>
                                            }>
                                                <span class="loading loading-spinner loading-xs"></span>
                                                <Show when={item.fix?.kind === "install-package" || item.fix?.kind === "install-bucket"} fallback={
                                                    <>{t("common.opening")}</>
                                                }>
                                                    {t("common.installing")}
                                                </Show>
                                            </Show>
                                        </button>
                                    </Show>
                                </div>
                                <Show when={item.suggestion}>
                                    <div class="mt-2 ml-8 text-sm p-2 bg-base-300 rounded-md">
                                        <p class="font-semibold mb-1">{t("doctor.suggestion")}</p>
                                        <code class="font-mono ">{item.suggestion}</code>
                                    </div>
                                </Show>
                            </li>
                        )}
                    </For>
                </ul>
            </Show>
        </Card>
    );
}

export default Checkup;

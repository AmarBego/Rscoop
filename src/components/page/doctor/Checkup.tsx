import { For, Show } from "solid-js";
import { CircleCheckBig, CircleX, TriangleAlert, RefreshCw, Download } from "lucide-solid";

export interface CheckupItem {
    id: string | null;
    status: boolean;
    text: string;
    suggestion: string | null;
}

interface CheckupProps {
    checkupResult: CheckupItem[];
    isLoading: boolean;
    error: string | null;
    onRerun: () => void;
    onInstallHelper: (id: string) => void;
    installingHelper: string | null;
}

function Checkup(props: CheckupProps) {
    return (
        <div class="card bg-base-200 shadow-xl">
            <div class="card-body">
                <div class="flex justify-between items-center">
                    <h2 class="card-title text-xl">
                        System Health Check
                    </h2>

                    <button class="btn btn-ghost btn-sm" onClick={props.onRerun} disabled={props.isLoading}>
                        <RefreshCw classList={{ "animate-spin": props.isLoading }} />
                    </button>
                </div>
                <p class="text-base-content/80 mb-4">
                    This tool checks for common problems with your Scoop setup.
                </p>

                <Show when={props.isLoading}>
                    <div class="flex justify-center p-8">
                        <span class="loading loading-dots loading-lg"></span>
                    </div>
                </Show>

                <Show when={props.error}>
                    <div class="alert alert-error text-sm">
                        <TriangleAlert class="w-5 h-5" />
                        <span>{props.error}</span>
                    </div>
                </Show>

                <Show when={!props.isLoading && !props.error && props.checkupResult.length > 0}>
                    <ul class="space-y-3">
                        <For each={props.checkupResult}>
                            {(item) => (
                                <li class="p-3 bg-base-100 rounded-lg">
                                    <div class="flex items-center">
                                        <Show when={item.status} fallback={<CircleX class="w-5 h-5 mr-3 text-error" />}>
                                            <CircleCheckBig class="w-5 h-5 mr-3 text-success" />
                                        </Show>
                                        <span class="flex-grow">{item.text}</span>
                                        <Show when={item.id && !item.status}>
                                            <button
                                                class="btn btn-xs btn-outline btn-primary"
                                                onClick={() => props.onInstallHelper(item.id!)}
                                                disabled={!!props.installingHelper}
                                            >
                                                <Show when={props.installingHelper === item.id} fallback={
                                                    <>
                                                        <Download class="w-3 h-3 mr-1" />
                                                        Install
                                                    </>
                                                }>
                                                    <span class="loading loading-spinner loading-xs"></span>
                                                    Installing...
                                                </Show>
                                            </button>
                                        </Show>
                                    </div>
                                    <Show when={item.suggestion}>
                                        <div class="mt-2 ml-8 text-sm p-2 bg-base-300 rounded-md">
                                            <p class="font-semibold mb-1">Suggestion:</p>
                                            <code class="font-mono text-base-content/80">{item.suggestion}</code>
                                        </div>
                                    </Show>
                                </li>
                            )}
                        </For>
                    </ul>
                </Show>
            </div>
        </div>
    );
}

export default Checkup; 
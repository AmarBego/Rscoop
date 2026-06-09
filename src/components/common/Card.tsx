import { Component, JSX, Show } from "solid-js";
import { Dynamic } from "solid-js/web";

interface CardProps {
    title: string | JSX.Element;
    icon?: Component<{ class?: string }>;
    description?: string | JSX.Element;
    headerAction?: JSX.Element;
    children?: JSX.Element | JSX.Element[];
    class?: string;
}

export default function Card(props: CardProps) {
    const descriptionId =
        typeof props.title === "string" && props.description
            ? `card-desc-${props.title.replace(/\s+/g, "-").toLowerCase()}`
            : undefined;

    return (
        <section
            class={`card bg-base-300 shadow-xl ${props.class ?? ""}`}
            aria-describedby={descriptionId}
        >
            <div class="card-body p-4">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h2 class="card-title text-lg sm:text-xl flex items-center min-w-0">
                        {props.icon && (
                            <Dynamic component={props.icon} class="w-6 h-6 me-2 text-primary shrink-0" />
                        )}

                        <span class="min-w-0 break-words">{props.title}</span>
                    </h2>
                    <Show when={props.headerAction}>
                        <div class="form-control w-full sm:w-auto sm:shrink-0">{props.headerAction}</div>
                    </Show>
                </div>

                <Show when={props.description}>
                    <div id={descriptionId} class="mb-4 text-sm text-base-content/70 break-words">
                        {props.description}
                    </div>
                </Show>

                {props.children}
            </div>
        </section>
    );
}


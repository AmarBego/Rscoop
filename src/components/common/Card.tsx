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
                <div class="flex items-center justify-between">
                    <h2 class="card-title text-xl flex items-center">
                        {props.icon && (
                            <Dynamic component={props.icon} class="w-6 h-6 mr-2 text-primary" />
                        )}

                        {props.title}
                    </h2>
                    <Show when={props.headerAction}>
                        <div class="form-control">{props.headerAction}</div>
                    </Show>
                </div>

                <Show when={props.description}>
                    <div id={descriptionId} class=" mb-4">
                        {props.description}
                    </div>
                </Show>

                {props.children}
            </div>
        </section>
    );
}


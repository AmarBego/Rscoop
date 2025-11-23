import { Component, JSX, Show } from "solid-js";
import { Dynamic } from "solid-js/web";

interface CardProps {
    title: string;
    icon?: Component<{ class?: string }>;
    description?: string | JSX.Element;
    headerAction?: JSX.Element;
    children?: JSX.Element | JSX.Element[];
    class?: string;
}

export default function Card(props: CardProps) {
    const descriptionId = `card-desc-${props.title.replace(/\s+/g, "-").toLowerCase()}`;

    return (
        <section class={`card bg-base-200 shadow-xl ${props.class ?? ""}`}>
            <div class="card-body">
                <div class="flex items-center justify-between">
                    <h2 class="card-title text-xl flex items-center">
                        <Show when={props.icon}>
                            <Dynamic component={props.icon!} class="w-6 h-6 mr-2 text-primary" />
                        </Show>
                        {props.title}
                    </h2>
                    <Show when={props.headerAction}>
                        <div class="form-control">{props.headerAction}</div>
                    </Show>
                </div>
                <Show when={props.description}>
                    <div id={descriptionId} class="text-base-content/80 mb-4">
                        {props.description}
                    </div>
                </Show>
                {props.children}
            </div>
        </section>
    );
}

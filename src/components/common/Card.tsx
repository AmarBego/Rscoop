import { Component, JSX, Show } from "solid-js";
import { Dynamic } from "solid-js/web";

interface CardProps {
    title: string | JSX.Element;
    icon?: Component<{ class?: string }>;
    description?: string | JSX.Element;
    headerAction?: JSX.Element;
    children?: JSX.Element | JSX.Element[];
    class?: string;
    layout?: "list" | "grid";
    gridCols?: 1 | 2 | 3 | 4;
}

export default function Card({
    layout = "list",
    gridCols = 3,
    ...props
}: CardProps) {
    const descriptionId =
        typeof props.title === "string" && props.description
            ? `card-desc-${props.title.replace(/\s+/g, "-").toLowerCase()}`
            : undefined;

    const gridColsMap: Record<1 | 2 | 3 | 4, string> = {
        1: "grid-cols-1",
        2: "grid-cols-2",
        3: "grid-cols-3",
        4: "grid-cols-4",
    };


    return (
        <section
            class={`card bg-base-200 shadow-xl ${props.class ?? ""}`}
            aria-describedby={descriptionId}
        >
            <div class="card-body">
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
                    <div id={descriptionId} class="text-base-content/80 mb-4">
                        {props.description}
                    </div>
                </Show>

                <div
                    class={
                        layout === "grid"
                            ? `grid gap-4 ${gridColsMap[gridCols]}`
                            : "flex flex-col gap-4"
                    }
                >
                    {props.children}
                </div>
            </div>
        </section>
    );
}


import { JSX, Show } from "solid-js";

interface SettingsToggleProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    /**
     * If true, displays the "Enabled"/"Disabled" status label.
     * Takes precedence over `label` if both are provided, or can be used alongside if designed that way.
     * For now, we'll assume it's one or the other or StatusLabel appears first.
     */
    showStatusLabel?: boolean;
    /**
     * Custom label text or element.
     */
    label?: string | JSX.Element;
    className?: string;
    children?: JSX.Element;
}

export default function SettingsToggle(props: SettingsToggleProps) {
    return (
        <label class={`label cursor-pointer ${props.className ?? ""}`}>
            <Show when={props.showStatusLabel}>
                <span class="label-text mr-4">
                    {props.checked ? "Enabled" : "Disabled"}
                </span>
            </Show>
            {props.children}
            <Show when={!props.children && props.label}>
                <span class="label-text mr-4">
                    {props.label}
                </span>
            </Show>

            <input
                type="checkbox"
                class="toggle toggle-primary"
                checked={props.checked}
                disabled={props.disabled}
                onChange={(e) => props.onChange(e.currentTarget.checked)}
            />
        </label>
    );
}

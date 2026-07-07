import { JSX, Show } from "solid-js";
import { useI18n } from "../../i18n";

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
    ariaLabel?: string;
    describedBy?: string;
    className?: string;
    children?: JSX.Element;
}

export default function SettingsToggle(props: SettingsToggleProps) {
    const { t } = useI18n();

    return (
        <label class={`label cursor-pointer ${props.className ?? ""}`}>
            <Show when={props.showStatusLabel}>
                <span class="label-text me-4">
                    {props.checked ? t("common.enabled") : t("common.disabled")}
                </span>
            </Show>
            {props.children}
            <Show when={!props.children && props.label}>
                <span class="label-text me-4">
                    {props.label}
                </span>
            </Show>

            <input
                type="checkbox"
                class="toggle toggle-primary"
                checked={props.checked}
                disabled={props.disabled}
                aria-label={props.ariaLabel}
                aria-describedby={props.describedBy}
                onChange={(e) => props.onChange(e.currentTarget.checked)}
            />
        </label>
    );
}

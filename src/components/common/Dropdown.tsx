import { JSX, Show } from "solid-js";
import { Check } from "lucide-solid";

export type DropdownSize = "sm" | "md" | "lg";
export type DropdownTone = "dark" | "light";
export type DropdownAlign = "start" | "end";
export type DropdownDirection = "bottom" | "top";

interface DropdownProps {
  /** Content rendered inside the trigger button (icon, icon+text, label). */
  trigger: JSX.Element;
  /** Accessible label for the trigger button. */
  ariaLabel: string;
  /** Trigger + item sizing. Default: "md".
   *   sm = btn-xs trigger, dense items (per-row actions).
   *   md = btn-sm trigger (header actions). Default.
   *   lg = default btn (~h-10) trigger (prominent CTAs). */
  size?: DropdownSize;
  /** Menu surface tone. Default: "dark".
   *   dark  = bg-base-100, use over lighter parents (cards, modals).
   *   light = bg-base-300, use over the darker page bg. */
  tone?: DropdownTone;
  /** Menu alignment relative to trigger. Default: "end". */
  align?: DropdownAlign;
  /** Menu opens upward instead of downward. Default: "bottom". */
  direction?: DropdownDirection;
  /** Render trigger as btn-circle (icon-only triggers). Default: false. */
  iconOnly?: boolean;
  /** Override trigger button class. Use sparingly. */
  triggerClass?: string;
  /** Tooltip text shown on trigger hover (also sets data-tip). Pairs with ariaLabel for SR. */
  triggerTooltip?: string;
  /** Menu width Tailwind class. Default: "w-52". */
  menuWidth?: string;
  /** Cap menu height with scroll on overflow. Default: false. */
  scrollable?: boolean;
  /** Disable the trigger. */
  disabled?: boolean;
  /** Menu items: DropdownItem / DropdownTitle / DropdownDivider / DropdownLoadingItem. */
  children: JSX.Element;
}

const triggerSizeClass = (size: DropdownSize): string => {
  switch (size) {
    case "sm": return "btn-xs";
    case "lg": return "";
    case "md":
    default: return "btn-sm";
  }
};

const toneSurfaceClass = (tone: DropdownTone): string => {
  return tone === "light"
    ? "bg-base-300 border border-base-content/10"
    : "bg-base-100 border border-base-content/10";
};

export function Dropdown(props: DropdownProps) {
  const size = () => props.size ?? "md";
  const tone = () => props.tone ?? "dark";
  const align = () => props.align ?? "end";
  const direction = () => props.direction ?? "bottom";
  const menuWidth = () => props.menuWidth ?? "w-52";

  return (
    <div class={`dropdown ${align() === "end" ? "dropdown-end" : ""} ${direction() === "top" ? "dropdown-top" : ""}`}>
      <button
        type="button"
        tabindex="0"
        disabled={props.disabled}
        class={`btn btn-ghost ${triggerSizeClass(size())} ${props.iconOnly ? "btn-circle" : ""} ${props.triggerTooltip ? "tooltip tooltip-bottom" : ""} ${props.triggerClass ?? ""}`}
        aria-label={props.ariaLabel}
        data-tip={props.triggerTooltip}
      >
        {props.trigger}
      </button>
      <ul
        tabindex="0"
        class={`dropdown-content menu p-2 shadow ${toneSurfaceClass(tone())} rounded-box ${menuWidth()} z-[100] ${props.scrollable ? "max-h-80 overflow-y-auto flex-nowrap" : ""}`}
      >
        {props.children}
      </ul>
    </div>
  );
}

interface DropdownItemProps {
  onClick?: (e: MouseEvent) => void;
  /** Highlight as currently-selected (e.g. in a filter list). */
  active?: boolean;
  disabled?: boolean;
  /** Destructive action: red text. */
  destructive?: boolean;
  /** Optional icon rendered to the left of the label. */
  icon?: JSX.Element;
  children: JSX.Element;
}

/**
 * Standard menu item. Renders <li><button>...</button></li>.
 *
 * Active state without an explicit icon shows a Check glyph (filter-list pattern).
 * Active state with an explicit icon keeps the icon and adds bg tint + primary text.
 */
export function DropdownItem(props: DropdownItemProps) {
  return (
    <li>
      <button
        type="button"
        disabled={props.disabled}
        classList={{
          "bg-primary/15 text-primary font-medium": !!props.active,
          "text-error": !!props.destructive && !props.active,
          "btn-disabled cursor-not-allowed": !!props.disabled,
        }}
        onClick={(e) => {
          if (props.disabled) return;
          props.onClick?.(e);
          (e.currentTarget as HTMLButtonElement).blur();
        }}
      >
        <Show when={props.icon} fallback={
          <Show when={props.active}>
            <Check class="w-4 h-4 shrink-0" aria-hidden="true" />
          </Show>
        }>
          <span class="w-4 h-4 shrink-0 inline-flex items-center justify-center">{props.icon}</span>
        </Show>
        <span class="truncate">{props.children}</span>
      </button>
    </li>
  );
}

interface DropdownTitleProps {
  children: JSX.Element;
}

/** Section header inside the menu (DaisyUI menu-title). Not focusable. */
export function DropdownTitle(props: DropdownTitleProps) {
  return <li class="menu-title">{props.children}</li>;
}

/** Visual separator between groups. */
export function DropdownDivider() {
  return <li class="border-t border-base-content/10 my-1" aria-hidden="true" />;
}

interface DropdownLoadingItemProps {
  /** Optional label rendered next to the spinner. */
  label?: string;
}

/**
 * In-flight row. Renders a non-interactive spinner-only li.
 * Use when a per-item operation is running and you want to occupy the row's slot.
 */
export function DropdownLoadingItem(props: DropdownLoadingItemProps) {
  return (
    <li>
      <span class="flex items-center justify-center gap-2 p-2 pointer-events-none">
        <span class="loading loading-spinner loading-xs" aria-hidden="true" />
        <Show when={props.label}>
          <span class="text-base-content/60">{props.label}</span>
        </Show>
      </span>
    </li>
  );
}

export default Dropdown;

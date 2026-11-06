/** Global keyboard-shortcut helpers. */

/** Dispatched when the app should focus the contextual search input. */
export const FOCUS_SEARCH_EVENT = "rscoop:focus-search";

export function requestSearchFocus(): void {
  window.dispatchEvent(new CustomEvent(FOCUS_SEARCH_EVENT));
}

/** True when the element is a text-editing target (typing shortcuts like "/" must not fire). */
export function isEditableElement(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/** True when any modal dialog is currently open. */
export function isModalOpen(): boolean {
  return document.querySelector(".modal-open") !== null;
}

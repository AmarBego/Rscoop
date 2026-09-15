import { Show, createEffect, createMemo, createSignal, on } from "solid-js";
import hljs from "highlight.js/lib/core";
import json from "highlight.js/lib/languages/json";

hljs.registerLanguage("json", json);

interface Props {
  content: string;
  editing: boolean;
  disabled: boolean;
  label: string;
  invalid: boolean;
  onInput: (content: string) => void;
  onSave: () => void;
}

export default function ManifestCodeEditor(props: Props) {
  let preview: HTMLPreElement | undefined;
  let input: HTMLTextAreaElement | undefined;
  const [height, setHeight] = createSignal<number>();
  const highlighted = createMemo(() => hljs.highlight(props.content, { language: "json" }).value);

  const syncScroll = () => {
    if (!preview || !input) return;
    preview.scrollTop = input.scrollTop;
    preview.scrollLeft = input.scrollLeft;
  };

  createEffect(on(() => props.editing, (editing) => {
    if (!editing || !preview) return;
    const top = preview.scrollTop;
    const left = preview.scrollLeft;
    const style = getComputedStyle(preview);
    const lineHeight = parseFloat(style.lineHeight);
    const line = Math.max(0, Math.ceil((top - parseFloat(style.paddingTop)) / lineHeight));
    const lines = props.content.split("\n");
    const lineIndex = Math.min(line, lines.length - 1);
    const column = Math.min(Math.ceil(left / (parseFloat(style.fontSize) * 0.6)), lines[lineIndex].length);
    const caret = lines.slice(0, lineIndex).reduce((offset, text) => offset + text.length + 1, 0) + column;
    // Keep both the modal geometry and the existing viewport when editing starts.
    setHeight(preview.getBoundingClientRect().height);
    queueMicrotask(() => {
      if (!props.editing || !input?.isConnected) return;
      input.setSelectionRange(caret, caret);
      input.focus({ preventScroll: true });
      input.scrollTop = top;
      input.scrollLeft = left;
      syncScroll();
    });
  }));

  return (
    <div class="relative">
      {/* Keep the highlighted surface mounted in both modes, so its viewport
          survives Edit, Cancel, and Save. The transparent input supplies native
          selection, undo, clipboard, and IME while this layer supplies color. */}
      <pre ref={preview} dir="ltr" aria-hidden={props.editing}
        class="p-4 m-0 font-mono text-sm leading-relaxed text-start overflow-auto max-h-[45vh] min-h-48 rounded-b-xl custom-scrollbar"
        classList={{ "pointer-events-none": props.editing }}
        style={{ height: height() ? `${height()}px` : undefined, "tab-size": 2 }}>
        <code class="language-json !bg-transparent" style={{ font: "inherit" }}
          innerHTML={highlighted() + (props.editing ? "\n" : "")} />
      </pre>
      <Show when={props.editing}>
        <textarea ref={input} dir="ltr" aria-label={props.label}
          aria-invalid={props.invalid} aria-describedby={props.invalid ? "manifest-json-error" : undefined}
          class="absolute inset-0 block bg-transparent rounded-b-xl border-0 p-4 m-0 font-mono text-sm leading-relaxed w-full h-full resize-none text-start outline-none focus:ring-1 focus:ring-inset focus:ring-primary custom-scrollbar selection:bg-primary/25"
          style={{ color: "transparent", "caret-color": "var(--color-base-content)", "tab-size": 2 }}
          spellcheck={false} autocapitalize="off" autocomplete="off" wrap="off"
          value={props.content} disabled={props.disabled}
          onScroll={syncScroll}
          onInput={(event) => { props.onInput(event.currentTarget.value); syncScroll(); }}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
              event.preventDefault();
              props.onSave();
            }
          }} />
      </Show>
    </div>
  );
}

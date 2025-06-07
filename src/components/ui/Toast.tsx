import { createContext, useContext, JSX, For } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { Check, X, AlertCircle, Info } from "lucide-solid";
import { Motion } from "solid-motionone";

type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
  id: string;
  title: string;
  description?: string;
  type: ToastType;
  duration?: number;
}

interface ToastContextValue {
  toasts: Toast[];
  toast: (props: Omit<Toast, "id">) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue>({
  toasts: [],
  toast: () => {},
  dismiss: () => {},
});

// Simple ID generation
const createId = () => `toast-${Math.random().toString(36).substring(2, 11)}`;

export function ToastProvider(props: { children: JSX.Element }) {
  const [toasts, setToasts] = createStore<Toast[]>([]);

  const toast = (props: Omit<Toast, "id">) => {
    const id = createId();
    setToasts(produce(draft => {
      draft.push({ ...props, id });
    }));

    if (props.duration !== Infinity) {
      setTimeout(() => {
        dismiss(id);
      }, props.duration || 5000);
    }
  };

  const dismiss = (id: string) => {
    setToasts(produce(draft => {
      const index = draft.findIndex(t => t.id === id);
      if (index !== -1) {
        draft.splice(index, 1);
      }
    }));
  };

  const value = {
    toasts,
    toast,
    dismiss,
  };

  return (
    <ToastContext.Provider value={value}>
      {props.children}
      <div aria-live="polite" aria-atomic="true" class="sr-only">
        <For each={toasts}>
          {toast => <div role="status">{toast.title}</div>}
        </For>
      </div>
      <div class="fixed bottom-0 right-0 z-50 flex flex-col gap-2 p-4 max-w-md">
        <For each={toasts}>
          {(toast) => (
            <Motion
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 50 }}
              transition={{ duration: 0.3, easing: "ease-out" }}
              class="bg-dark-surface border border-dark-border shadow-lg rounded-lg overflow-hidden"
            >
              <div class="flex p-4 gap-3">
                <div class="flex-shrink-0">
                  {toast.type === "success" && <Check class="w-5 h-5 text-green-500" />}
                  {toast.type === "error" && <X class="w-5 h-5 text-red-500" />}
                  {toast.type === "warning" && <AlertCircle class="w-5 h-5 text-yellow-500" />}
                  {toast.type === "info" && <Info class="w-5 h-5 text-primary-500" />}
                </div>
                <div class="flex-1">
                  <h3 class="text-dark-text-primary font-medium">{toast.title}</h3>
                  {toast.description && (
                    <p class="text-dark-text-secondary text-sm mt-1">{toast.description}</p>
                  )}
                </div>
                <button 
                  class="flex-shrink-0 text-dark-text-secondary hover:text-dark-text-primary"
                  onClick={() => dismiss(toast.id)}
                >
                  <X class="w-4 h-4" />
                </button>
              </div>
              <div class="h-1 bg-dark-border">
                <div 
                  class={`h-full ${toast.type === "success" ? "bg-green-500" : toast.type === "error" ? "bg-red-500" : toast.type === "warning" ? "bg-yellow-500" : "bg-primary-500"}`}
                  style={{
                    "animation": `shrink ${toast.duration || 5000}ms linear forwards`
                  }}
                />
              </div>
            </Motion>
          )}
        </For>
      </div>
      <style>{`
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
} 
import { createSignal, For, Show } from "solid-js";
import { Dialog } from "@kobalte/core/dialog";
import { createFuzzySearch } from "../../utils/fuzzySearch";
import { Search, Command } from "lucide-solid";

type CommandItem = {
  id: string;
  name: string;
  description: string;
  shortcut?: string[];
  action: () => void;
};

interface CommandPaletteProps {
  commands: CommandItem[];
}

export function CommandPalette(props: CommandPaletteProps) {
  const [isOpen, setIsOpen] = createSignal(false);
  const [searchQuery, setSearchQuery] = createSignal("");
  let inputRef: HTMLInputElement | undefined;
  
  const fuzzySearch = createFuzzySearch(
    () => props.commands,
    (item) => [item.name, item.description]
  );
  
  const filteredCommands = () => {
    const query = searchQuery();
    if (!query) return props.commands;
    return fuzzySearch(query);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setIsOpen(true);
    }
  };

  // Focus input when dialog opens
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      // Use setTimeout to ensure the dialog is mounted
      setTimeout(() => {
        inputRef?.focus();
      }, 0);
    }
  };

  document.addEventListener("keydown", handleKeyDown);

  return (
    <Dialog open={isOpen()} onOpenChange={handleOpenChange}>
      <Dialog.Trigger class="sr-only">Open Command Palette</Dialog.Trigger>
      
      <Dialog.Portal>
        <Dialog.Overlay class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        
        <Dialog.Content class="fixed left-[50%] top-[20%] z-50 w-full max-w-xl translate-x-[-50%] rounded-xl border border-dark-border bg-dark-surface p-4 shadow-2xl">
          <div class="flex flex-col gap-4">
            <div class="relative">
              <input 
                ref={inputRef}
                class="w-full pl-10 pr-4 py-3 text-lg bg-dark-background/60 backdrop-blur-sm border border-dark-border focus:ring-2 focus:ring-primary-500 focus:border-transparent text-dark-text-primary placeholder-dark-text-secondary rounded-xl transition-all duration-200"
                placeholder="Search commands..."
                value={searchQuery()}
                onInput={(e) => setSearchQuery(e.currentTarget.value)}
              />
              <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search class="w-5 h-5 text-dark-text-secondary" />
              </div>
              <div class="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <Command class="w-5 h-5 text-dark-text-secondary" />
              </div>
            </div>

            <div class="max-h-[300px] overflow-y-auto">
              <Show when={filteredCommands().length > 0} fallback={
                <div class="text-center py-8">
                  <p class="text-dark-text-secondary">No commands found</p>
                </div>
              }>
                <For each={filteredCommands()}>
                  {(item) => (
                    <button
                      class="w-full text-left px-4 py-3 rounded-lg hover:bg-dark-background/80 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors duration-150"
                      onClick={() => {
                        item.action();
                        setIsOpen(false);
                      }}
                    >
                      <div class="flex justify-between">
                        <div>
                          <div class="font-medium text-dark-text-primary">{item.name}</div>
                          <div class="text-sm text-dark-text-secondary">{item.description}</div>
                        </div>
                        <Show when={item.shortcut}>
                          <div class="flex items-center gap-1">
                            <For each={item.shortcut}>
                              {(key) => (
                                <span class="px-2 py-1 rounded bg-dark-background text-xs font-medium text-dark-text-secondary">
                                  {key}
                                </span>
                              )}
                            </For>
                          </div>
                        </Show>
                      </div>
                    </button>
                  )}
                </For>
              </Show>
            </div>

            <Dialog.CloseButton class="absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-full hover:bg-dark-background/80">
              <span class="sr-only">Close</span>
              <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Dialog.CloseButton>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
} 
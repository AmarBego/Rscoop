import { createSignal, onMount } from "solid-js";
import { Switch } from "@kobalte/core/switch";
import { Sun, Moon } from "lucide-solid";

export function ThemeToggle() {
  const [isDark, setIsDark] = createSignal(false);
  let switchRef: HTMLButtonElement | undefined;

  onMount(() => {
    // Check for system preference or saved preference
    const savedTheme = localStorage.getItem("color-theme");
    const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    
    const shouldUseDark = 
      savedTheme === "dark" || 
      (!savedTheme && systemPrefersDark);
    
    setIsDark(shouldUseDark);
    updateTheme(shouldUseDark);
  });

  const updateTheme = (dark: boolean) => {
    if (dark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("color-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("color-theme", "light");
    }

    // Animate the icon - using css instead of motion API
    if (switchRef) {
      switchRef.classList.add("scale-animate");
      setTimeout(() => {
        switchRef.classList.remove("scale-animate");
      }, 200);
    }
  };

  const toggleTheme = () => {
    const newTheme = !isDark();
    setIsDark(newTheme);
    updateTheme(newTheme);
  };

  return (
    <Switch
      checked={isDark()} 
      onChange={toggleTheme}
      ref={switchRef}
      class="inline-flex h-9 items-center justify-center rounded-lg bg-dark-background/50 p-1 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-dark-background"
    >
      <span class="sr-only">Toggle theme</span>
      <div class="relative inline-flex items-center">
        {isDark() ? (
          <Moon class="h-5 w-5 text-primary-400" />
        ) : (
          <Sun class="h-5 w-5 text-primary-400" />
        )}
      </div>
    </Switch>
  );
} 
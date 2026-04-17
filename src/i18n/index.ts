import { createSignal, createRoot } from "solid-js";

type Locale = Record<string, string>;

// All locale imports — add new languages here
import en from "./locales/en.json";
import de from "./locales/de.json";
import zh from "./locales/zh.json";

const locales: Record<string, Locale> = { en, de, zh };

// Available languages for the picker
export const availableLanguages = [
  { code: "en", name: "English" },
  { code: "de", name: "Deutsch" },
  { code: "zh", name: "简体中文" },
  // { code: "fr", name: "Français" },
  // { code: "es", name: "Español" },
  // { code: "ja", name: "日本語" },
];

function createI18n() {
  const [locale, setLocale] = createSignal("en");

  function t(key: string, params?: Record<string, string | number>): string {
    const dict = locales[locale()] ?? locales.en;
    let value = dict[key] ?? locales.en[key] ?? key;

    // Simple parameter substitution: "Installing {name}" → "Installing vscode"
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        value = value.replace(`{${k}}`, String(v));
      }
    }

    return value;
  }

  function setLanguage(lang: string) {
    if (locales[lang]) {
      setLocale(lang);
    }
  }

  return { t, locale, setLanguage };
}

const i18n = createRoot(createI18n);

export const useI18n = () => i18n;
export default i18n;

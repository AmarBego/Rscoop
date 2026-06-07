import { createSignal, createRoot } from "solid-js";

type Locale = Record<string, string>;

// All locale imports — add new languages here
import en from "./locales/en.json";
import de from "./locales/de.json";
import zh from "./locales/zh.json";
import ar from "./locales/ar.json";

const locales: Record<string, Locale> = { en, de, zh, ar };
const DEFAULT_LANGUAGE = "en";

export type LocaleDirection = "ltr" | "rtl";

export interface LanguageInfo {
  code: string;
  name: string;
  dir: LocaleDirection;
}

const RTL_LANGUAGE_CODES = new Set(["ar", "fa", "he", "ur"]);

// Available languages for the picker
export const availableLanguages: LanguageInfo[] = [
  { code: "en", name: "English", dir: "ltr" },
  { code: "de", name: "Deutsch", dir: "ltr" },
  { code: "zh", name: "简体中文", dir: "ltr" },
  { code: "ar", name: "العربية", dir: "rtl" },
  // { code: "fr", name: "Français" },
  // { code: "es", name: "Español" },
  // { code: "ja", name: "日本語" },
];

export function getLanguageDirection(lang: string): LocaleDirection {
  const configuredDirection = availableLanguages.find((l) => l.code === lang)?.dir;
  if (configuredDirection) return configuredDirection;

  const baseCode = lang.split(/[-_]/)[0]?.toLowerCase();
  return baseCode && RTL_LANGUAGE_CODES.has(baseCode) ? "rtl" : "ltr";
}

function applyDocumentLanguage(lang: string) {
  if (typeof document === "undefined") return;

  document.documentElement.lang = lang;
  document.documentElement.dir = getLanguageDirection(lang);
}

function createI18n() {
  const [locale, setLocale] = createSignal(DEFAULT_LANGUAGE);
  applyDocumentLanguage(DEFAULT_LANGUAGE);

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
      applyDocumentLanguage(lang);
    }
  }

  const direction = () => getLanguageDirection(locale());

  return { t, locale, direction, setLanguage };
}

const i18n = createRoot(createI18n);

export const useI18n = () => i18n;
export default i18n;

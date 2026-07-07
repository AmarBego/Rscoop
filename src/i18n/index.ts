import { createSignal, createRoot } from "solid-js";

type Locale = Record<string, string>;

// All locale imports — add new languages here
import en from "./locales/en.json";
import de from "./locales/de.json";
import zh from "./locales/zh.json";
import ar from "./locales/ar.json";
import fa from "./locales/fa.json";
import { SETTINGS_STORAGE_KEY } from "../stores/settingsStorage";

const locales: Record<string, Locale> = { en, de, zh, ar, fa };
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
  { code: "fa", name: "فارسی", dir: "rtl" },
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

function getInitialLanguage(): string {
  if (typeof localStorage === "undefined") return DEFAULT_LANGUAGE;

  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!stored) return DEFAULT_LANGUAGE;

    const parsed = JSON.parse(stored) as { language?: unknown };
    return typeof parsed.language === "string" && locales[parsed.language]
      ? parsed.language
      : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

function createI18n() {
  const initialLanguage = getInitialLanguage();
  const [locale, setLocale] = createSignal(initialLanguage);
  applyDocumentLanguage(initialLanguage);

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

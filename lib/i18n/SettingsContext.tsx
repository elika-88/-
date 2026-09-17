"use client";

import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { type SupportedLanguage, type Translations, translations } from "./translations";

export type ThemeMode = "light" | "dark" | "system";

type SettingsContextType = {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  t: Translations;
};

const SettingsContext = createContext<SettingsContextType | null>(null);
const LANGUAGE_KEY = "lumina.settings.lang";
const THEME_KEY = "lumina.settings.theme";
const SETTINGS_EVENT = "lumina:settings-changed";
const memorySettings = new Map<string, string>();

function subscribe(callback: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === LANGUAGE_KEY || event.key === THEME_KEY) {
      if (event.key === null) memorySettings.clear();
      else memorySettings.delete(event.key);
      callback();
    }
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(SETTINGS_EVENT, callback);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(SETTINGS_EVENT, callback);
  };
}

function readSetting(key: string): string | null {
  if (memorySettings.has(key)) return memorySettings.get(key) ?? null;
  try {
    return localStorage.getItem(key);
  } catch {
    return memorySettings.get(key) ?? null;
  }
}

function writeSetting(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
    memorySettings.delete(key);
  } catch {
    // Keep settings usable for this tab when browser storage is unavailable.
    memorySettings.set(key, value);
  }
  window.dispatchEvent(new Event(SETTINGS_EVENT));
}

function getLanguage(): SupportedLanguage {
  const value = readSetting(LANGUAGE_KEY);
  return value === "en" || value === "zh" || value === "ru" || value === "kk" ? value : "en";
}

function getTheme(): ThemeMode {
  const value = readSetting(THEME_KEY);
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  // The server snapshots are also used for the first hydration render.
  const language = useSyncExternalStore(subscribe, getLanguage, () => "en" as const);
  const theme = useSyncExternalStore(subscribe, getTheme, () => "system" as const);

  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : language;
  }, [language]);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const isDark = theme === "dark" || (theme === "system" && media.matches);
      root.classList.toggle("dark", isDark);
      root.style.colorScheme = isDark ? "dark" : "light";
    };
    applyTheme();
    if (theme !== "system") return;
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [theme]);

  return (
    <SettingsContext.Provider
      value={{
        language,
        setLanguage: (lang) => writeSetting(LANGUAGE_KEY, lang),
        theme,
        setTheme: (nextTheme) => writeSetting(THEME_KEY, nextTheme),
        t: translations[language],
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within SettingsProvider");
  }
  return context;
}

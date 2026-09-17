"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { type SupportedLanguage, type Translations, translations } from "./translations";

export type ThemeMode = "light" | "dark" | "system";

type SettingsContextType = {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  autoSave: boolean;
  setAutoSave: (val: boolean) => void;
  soundEffects: boolean;
  setSoundEffects: (val: boolean) => void;
  fontSize: "normal" | "large" | "compact";
  setFontSize: (size: "normal" | "large" | "compact") => void;
  t: Translations;
  mounted: boolean;
};

const SettingsContext = createContext<SettingsContextType | null>(null);

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const isClient = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );

  const [language, setLanguageState] = useState<SupportedLanguage>("en");
  const [theme, setThemeState] = useState<ThemeMode>("system");
  const [autoSave, setAutoSaveState] = useState(true);
  const [soundEffects, setSoundEffectsState] = useState(false);
  const [fontSize, setFontSizeState] = useState<"normal" | "large" | "compact">("normal");

  useEffect(() => {
    try {
      const savedLang = localStorage.getItem("lumina.settings.lang") as SupportedLanguage;
      if (savedLang && translations[savedLang]) { // eslint-disable-next-line react-hooks/set-state-in-effect
        setLanguageState(savedLang);
      }

      const savedTheme = localStorage.getItem("lumina.settings.theme") as ThemeMode;
      if (savedTheme) {
        setThemeState(savedTheme);
      }

      const savedAutoSave = localStorage.getItem("lumina.settings.autosave");
      if (savedAutoSave !== null) {
        setAutoSaveState(savedAutoSave === "true");
      }

      const savedSound = localStorage.getItem("lumina.settings.sound");
      if (savedSound !== null) {
        setSoundEffectsState(savedSound === "true");
      }

      const savedFontSize = localStorage.getItem("lumina.settings.fontsize") as "normal" | "large" | "compact";
      if (savedFontSize) {
        setFontSizeState(savedFontSize);
      }
    } catch {}
  }, []);

  // Sync theme class to document
  useEffect(() => {
    if (!isClient) return;
    const root = document.documentElement;
    const isDark =
      theme === "dark" ||
      (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

    if (isDark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme, isClient]);

  const setLanguage = (lang: SupportedLanguage) => {
    setLanguageState(lang);
    try { localStorage.setItem("lumina.settings.lang", lang); } catch {}
  };

  const setTheme = (nextTheme: ThemeMode) => {
    setThemeState(nextTheme);
    try { localStorage.setItem("lumina.settings.theme", nextTheme); } catch {}
  };

  const setAutoSave = (val: boolean) => {
    setAutoSaveState(val);
    try { localStorage.setItem("lumina.settings.autosave", String(val)); } catch {}
  };

  const setSoundEffects = (val: boolean) => {
    setSoundEffectsState(val);
    try { localStorage.setItem("lumina.settings.sound", String(val)); } catch {}
  };

  const setFontSize = (size: "normal" | "large" | "compact") => {
    setFontSizeState(size);
    try { localStorage.setItem("lumina.settings.fontsize", size); } catch {}
  };

  return (
    <SettingsContext.Provider
      value={{
        language,
        setLanguage,
        theme,
        setTheme,
        autoSave,
        setAutoSave,
        soundEffects,
        setSoundEffects,
        fontSize,
        setFontSize,
        t: translations[language],
        mounted: isClient,
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

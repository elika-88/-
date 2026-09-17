"use client";

import { useState } from "react";
import {
  X,
  Sliders,
  Palette,
  Database,
  Info,
  Sun,
  Moon,
  Monitor,
  Download
} from "lucide-react";
import { useSettings } from "@/lib/i18n/SettingsContext";
import { SettingsLanguageSelect } from "./SettingsLanguageSelect";
import { STORAGE_KEY } from "@/lib/client/sessions";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

type Tab = "general" | "appearance" | "data" | "about";

export function SettingsModal({ isOpen, onClose }: Props) {
  const {
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
    t
  } = useSettings();

  const [activeTab, setActiveTab] = useState<Tab>("general");

  if (!isOpen) return null;

  const handleExportData = () => {
    try {
      const data = localStorage.getItem(STORAGE_KEY) || "{}";
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lumina-study-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
  };

  return (
    <div className="gpt-settings-backdrop" onClick={onClose}>
      <div className="gpt-settings-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="gpt-settings-header">
          <h2>{t.settingsTitle}</h2>
          <button className="gpt-settings-close-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="gpt-settings-body">
          {/* Sidebar Tabs */}
          <aside className="gpt-settings-tabs">
            <button
              className={`gpt-settings-tab-btn ${activeTab === "general" ? "active" : ""}`}
              onClick={() => setActiveTab("general")}
            >
              <Sliders size={16} />
              <span>{t.generalTab}</span>
            </button>
            <button
              className={`gpt-settings-tab-btn ${activeTab === "appearance" ? "active" : ""}`}
              onClick={() => setActiveTab("appearance")}
            >
              <Palette size={16} />
              <span>{t.appearanceTab}</span>
            </button>
            <button
              className={`gpt-settings-tab-btn ${activeTab === "data" ? "active" : ""}`}
              onClick={() => setActiveTab("data")}
            >
              <Database size={16} />
              <span>{t.studyModelTab}</span>
            </button>
            <button
              className={`gpt-settings-tab-btn ${activeTab === "about" ? "active" : ""}`}
              onClick={() => setActiveTab("about")}
            >
              <Info size={16} />
              <span>{t.aboutTab}</span>
            </button>
          </aside>

          {/* Tab Content Panel */}
          <main className="gpt-settings-content">
            {/* General Tab */}
            {activeTab === "general" && (
              <div className="gpt-settings-section">
                {/* Language Custom Rounded Select */}
                <div className="gpt-setting-row">
                  <div className="gpt-setting-info">
                    <label>{t.langLabel}</label>
                    <p>{t.langDesc}</p>
                  </div>
                  <SettingsLanguageSelect value={language} onChange={setLanguage} />
                </div>

                {/* Auto Save Toggle */}
                <div className="gpt-setting-row">
                  <div className="gpt-setting-info">
                    <label>{t.autoSaveLabel}</label>
                    <p>{t.autoSaveDesc}</p>
                  </div>
                  <label className="gpt-toggle-switch">
                    <input
                      type="checkbox"
                      checked={autoSave}
                      onChange={(e) => setAutoSave(e.target.checked)}
                    />
                    <span className="gpt-toggle-slider" />
                  </label>
                </div>

                {/* Sound Feedback */}
                <div className="gpt-setting-row">
                  <div className="gpt-setting-info">
                    <label>{t.soundEffectsLabel}</label>
                    <p>{t.soundEffectsDesc}</p>
                  </div>
                  <label className="gpt-toggle-switch">
                    <input
                      type="checkbox"
                      checked={soundEffects}
                      onChange={(e) => setSoundEffects(e.target.checked)}
                    />
                    <span className="gpt-toggle-slider" />
                  </label>
                </div>
              </div>
            )}

            {/* Appearance Tab */}
            {activeTab === "appearance" && (
              <div className="gpt-settings-section">
                {/* Theme Selector */}
                <div className="gpt-setting-row block">
                  <div className="gpt-setting-info">
                    <label>{t.themeLabel}</label>
                    <p>{t.themeDesc}</p>
                  </div>
                  <div className="gpt-theme-grid">
                    <button
                      className={`gpt-theme-card ${theme === "light" ? "active" : ""}`}
                      onClick={() => setTheme("light")}
                    >
                      <Sun size={20} />
                      <span>{t.themeLight}</span>
                    </button>
                    <button
                      className={`gpt-theme-card ${theme === "dark" ? "active" : ""}`}
                      onClick={() => setTheme("dark")}
                    >
                      <Moon size={20} />
                      <span>{t.themeDark}</span>
                    </button>
                    <button
                      className={`gpt-theme-card ${theme === "system" ? "active" : ""}`}
                      onClick={() => setTheme("system")}
                    >
                      <Monitor size={20} />
                      <span>{t.themeSystem}</span>
                    </button>
                  </div>
                </div>

                {/* Font Size Selector */}
                <div className="gpt-setting-row">
                  <div className="gpt-setting-info">
                    <label>{t.fontSizeLabel}</label>
                    <p>{t.fontSizeDesc}</p>
                  </div>
                  <select
                    className="gpt-setting-select"
                    value={fontSize}
                    onChange={(e) => setFontSize(e.target.value as "normal" | "large" | "compact")}
                  >
                    <option value="compact">{t.fontCompact}</option>
                    <option value="normal">{t.fontNormal}</option>
                    <option value="large">{t.fontLarge}</option>
                  </select>
                </div>
              </div>
            )}

            {/* Data & Learning Tab */}
            {activeTab === "data" && (
              <div className="gpt-settings-section">
                {/* Export Data */}
                <div className="gpt-setting-row">
                  <div className="gpt-setting-info">
                    <label>{t.exportDataLabel}</label>
                    <p>{t.exportDataDesc}</p>
                  </div>
                  <button className="gpt-secondary-btn" onClick={handleExportData}>
                    <Download size={14} />
                    <span>{t.exportBtn}</span>
                  </button>
                </div>
              </div>
            )}

            {/* About Tab */}
            {activeTab === "about" && (
              <div className="gpt-settings-section about">
                <div className="gpt-about-card">
                  <div className="gpt-about-brand">Lumina</div>
                  <p className="gpt-about-version">{t.versionLabel}</p>
                  <p className="gpt-about-desc">{t.licenseLabel}</p>
                </div>
              </div>
            )}
          </main>
        </div>

        {/* Modal Footer */}
        <div className="gpt-settings-footer">
          <button className="gpt-settings-done-btn" onClick={onClose}>
            {t.saveChanges}
          </button>
        </div>
      </div>
    </div>
  );
}

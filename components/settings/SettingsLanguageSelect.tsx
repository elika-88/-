"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import type { SupportedLanguage } from "@/lib/i18n/translations";

type Props = {
  value: SupportedLanguage;
  onChange: (val: SupportedLanguage) => void;
};

const LANG_OPTIONS: { value: SupportedLanguage; label: string }[] = [
  { value: "en", label: "English (English)" },
  { value: "zh", label: "中文 (Chinese Simplified)" },
  { value: "ru", label: "Русский (Russian)" },
  { value: "kk", label: "Қазақша (Kazakh)" },
];

export function SettingsLanguageSelect({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selected = LANG_OPTIONS.find((o) => o.value === value) || LANG_OPTIONS[0];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="gpt-settings-select-container" ref={dropdownRef}>
      <button
        type="button"
        className={`gpt-settings-select-trigger ${open ? "is-open" : ""}`}
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{selected.label}</span>
        <ChevronDown size={14} className={`gpt-select-arrow ${open ? "rotate" : ""}`} />
      </button>

      {open && (
        <ul className="gpt-settings-select-menu" role="listbox">
          {LANG_OPTIONS.map((opt) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              className={`gpt-settings-select-item ${opt.value === value ? "selected" : ""}`}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              <span>{opt.label}</span>
              {opt.value === value && <Check size={14} className="gpt-check-icon" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

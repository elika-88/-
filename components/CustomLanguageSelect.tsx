"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, Languages } from "lucide-react";
import type { OutputLanguage } from "@/lib/input";
import { useWorkspaceCopy } from "@/lib/i18n/workspace";

type Props = {
  value: OutputLanguage;
  disabled?: boolean;
  onChange: (val: OutputLanguage) => void;
};

const OPTIONS: OutputLanguage[] = ["auto", "en", "zh", "ru"];

export function CustomLanguageSelect({ value, disabled, onChange }: Props) {
  const w = useWorkspaceCopy();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selected = OPTIONS.includes(value) ? value : OPTIONS[0];

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
    <div className="gpt-custom-select-container" ref={dropdownRef}>
      <label className="gpt-custom-select-label">
        <Languages size={14} />
        <span>{w.outputLanguage}</span>
      </label>

      <button
        type="button"
        className={`gpt-custom-select-trigger ${open ? "is-open" : ""}`}
        disabled={disabled}
        onClick={() => !disabled && setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="gpt-select-text">{w.outputOptions[selected]}</span>
        <ChevronDown size={15} className={`gpt-select-arrow ${open ? "rotate" : ""}`} />
      </button>

      {open && (
        <ul className="gpt-custom-select-menu" role="listbox">
          {OPTIONS.map((opt) => (
            <li
              key={opt}
              role="option"
              aria-selected={opt === value}
              className={`gpt-custom-select-item ${opt === value ? "selected" : ""}`}
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
            >
              <span>{w.outputOptions[opt]}</span>
              {opt === value && <Check size={14} className="gpt-check-icon" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

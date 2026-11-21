"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import "./category-dropdown.css";

type Option = {
  value: string;
  label: string;
};

export default function CategoryDropdown({
  label,
  value,
  options,
  onChange,
  searchable = false,
  disabled = false,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  searchable?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const menuId = useId();

  const selected = options.find(option => option.value === value);
  const filtered = options.filter(option =>
    option.label.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (!open) return;

    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };

    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    };

    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, [open]);

  useEffect(() => {
    if (open && searchable) input.current?.focus();
  }, [open, searchable]);

  return (
    <div className="skcd-root" ref={root}>
      <button
        type="button"
        className="skcd-trigger"
        aria-label={label}
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="true"
        disabled={disabled}
        onClick={() => {
          setOpen(previous => !previous);
          setQuery("");
        }}
      >
        <span>{selected?.label ?? label}</span>
        <ChevronDown size={16} />
      </button>

      {open && !disabled && (
        <div className="skcd-menu" id={menuId}>
          {searchable && (
            <label className="skcd-search">
              <Search size={15} />
              <input
                ref={input}
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search categories..."
                aria-label={`Search ${label}`}
              />
            </label>
          )}

          <div className="skcd-options">
            {filtered.length === 0 ? (
              <p className="skcd-empty">No matching options</p>
            ) : (
              filtered.map(option => (
                <button
                  key={option.value}
                  type="button"
                  className={
                    "skcd-option" +
                    (option.value === value ? " selected" : "")
                  }
                  aria-pressed={option.value === value}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <span>{option.label}</span>
                  {option.value === value && <Check size={16} />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

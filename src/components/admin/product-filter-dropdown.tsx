"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

type Option = {
  value: string;
  label: string;
};

export default function ProductFilterDropdown({
  label,
  value,
  options,
  onChange,
  searchable = false,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const menuId = useId();

  const selected = options.find(option => option.value === value);
  const filtered = options.filter(option =>
    option.label.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (!open) return;

    function closeOutside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }

    function closeEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    }

    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, [open]);

  useEffect(() => {
    if (open && searchable) {
      searchInput.current?.focus();
    }
  }, [open, searchable]);

  return (
    <div className="skpm-dropdown" ref={root}>
      <button
        type="button"
        className="skpm-dropdown-trigger"
        aria-label={label}
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="true"
        onClick={() => {
          setOpen(previous => !previous);
          setQuery("");
        }}
      >
        <span>{selected?.label ?? label}</span>
        <ChevronDown size={16} />
      </button>

      {open && (
        <div className="skpm-dropdown-menu" id={menuId}>
          {searchable && (
            <label className="skpm-dropdown-search">
              <Search size={15} />
              <input
                ref={searchInput}
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search categories..."
                aria-label="Search categories"
              />
            </label>
          )}

          <div className="skpm-dropdown-options">
            {filtered.length === 0 ? (
              <p className="skpm-dropdown-empty">No matching options</p>
            ) : (
              filtered.map(option => (
                <button
                  key={option.value}
                  type="button"
                  className={
                    "skpm-dropdown-option" +
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

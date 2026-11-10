"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { filterOptions, type FilterOption } from "@/lib/filter-options";
import styles from "./workspace-filters.module.css";

type SearchSelectProps = {
  label: string;
  value: string;
  options: readonly FilterOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

export function SearchSelect({ label, value, options, onChange, placeholder = "Seleccioná una opción", disabled }: SearchSelectProps) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const visible = filterOptions(options, query);
  const current = Math.min(active, Math.max(0, visible.length - 1));
  const optionId = (index: number) => `${id}-option-${index}`;

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onOutside);
    return () => document.removeEventListener("pointerdown", onOutside);
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(`${id}-option-${current}`)?.scrollIntoView({ block: "nearest" });
  }, [current, id, open]);

  function show() {
    setQuery("");
    setActive(Math.max(0, options.findIndex((option) => option.value === value)));
    setOpen(true);
  }

  function close(restoreFocus: boolean) {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }

  function choose(option: FilterOption) {
    onChange(option.value);
    close(true);
  }

  function navigate(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      return close(true);
    }
    if (!["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) return;
    event.preventDefault();
    if (!visible.length) return;
    if (event.key === "Enter") choose(visible[current]);
    else setActive(Math.max(0, Math.min(visible.length - 1, current + (event.key === "ArrowDown" ? 1 : -1))));
  }

  return <div ref={root} className={styles.field} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) close(false);
  }}>
    <span id={`${id}-label`} className={styles.label}>{label}</span>
    <button type="button" ref={trigger} className={styles.trigger} disabled={disabled}
      aria-labelledby={`${id}-label ${id}-value`} aria-haspopup="listbox" aria-expanded={open}
      aria-controls={open ? `${id}-list` : undefined}
      onClick={() => open ? close(true) : show()}
      onKeyDown={(event) => { if (!open && ["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); show(); } }}>
      <span id={`${id}-value`}>{options.find((option) => option.value === value)?.label ?? placeholder}</span>
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" /></svg>
    </button>
    {open && <div className={styles.popover}>
      <input ref={input} type="search" role="combobox" aria-label={`Buscar ${label.toLowerCase()}`}
        aria-expanded="true" aria-autocomplete="list" aria-controls={`${id}-list`}
        aria-activedescendant={visible.length ? optionId(current) : undefined}
        placeholder="Buscar en la lista…" value={query}
        onChange={(event) => { setQuery(event.target.value); setActive(0); }} onKeyDown={navigate} />
      <ul role="listbox" id={`${id}-list`} aria-labelledby={`${id}-label`} className={styles.options}>
        {visible.map((option, index) => <li role="option" key={option.value} id={optionId(index)}
          aria-selected={option.value === value} data-active={index === current}
          onPointerDown={(event) => event.preventDefault()} onClick={() => choose(option)}>{option.label}</li>)}
      </ul>
      {!visible.length && <p role="status" className={styles.empty}>No hay opciones que coincidan.</p>}
    </div>}
  </div>;
}

export function FilterBar({ children, label = "Filtros" }: { children: ReactNode; label?: string }) {
  return <div role="group" aria-label={label} className={styles.bar}>{children}</div>;
}

export function FilterInput({ label, type = "search", value, onChange, placeholder }: {
  label: string; type?: "search" | "date"; value: string; onChange: (value: string) => void; placeholder?: string;
}) {
  return <label className={styles.field}>
    <span className={styles.label}>{label}</span>
    <input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
  </label>;
}

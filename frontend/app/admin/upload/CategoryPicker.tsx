"use client";

import { useState } from "react";
import { Category } from "@/lib/types";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import clsx from "clsx";

export interface FlatCat {
  id: number;
  label: string;
  path: string;
  depth: number;
}

export function flattenCats(cats: Category[], depth = 0): FlatCat[] {
  return cats.flatMap((c) => [
    { id: c.id, label: c.name, path: c.path, depth },
    ...flattenCats(c.children, depth + 1),
  ]);
}

export default function CategoryPicker({
  categories,
  selected,
  onChange,
  compact = false,
}: {
  categories: Category[];
  selected: number[];
  onChange: (ids: number[]) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const flat = flattenCats(categories);

  const toggle = (id: number) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  const selectedLabels = flat
    .filter((c) => selected.includes(c.id))
    .map((c) => c.path)
    .join(", ");

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          "w-full border border-slate-200 rounded-xl text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white",
          compact ? "px-2.5 py-1.5" : "px-3 py-2"
        )}
      >
        <span className={clsx("truncate", selected.length === 0 && "text-slate-400")}>
          {selected.length === 0
            ? "Select categories…"
            : selectedLabels || `${selected.length} selected`}
        </span>
        {open ? (
          <ChevronUp size={14} className="shrink-0 text-slate-400" />
        ) : (
          <ChevronDown size={14} className="shrink-0 text-slate-400" />
        )}
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
          {flat.map((c) => (
            <label
              key={c.id}
              className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-brand-50 cursor-pointer"
              style={{ paddingLeft: `${12 + c.depth * 16}px` }}
            >
              <input
                type="checkbox"
                checked={selected.includes(c.id)}
                onChange={() => toggle(c.id)}
                className="accent-brand-600 w-3.5 h-3.5 shrink-0"
              />
              <span
                className={clsx(
                  "text-sm",
                  c.depth === 0 ? "font-semibold text-slate-700" : "text-slate-600"
                )}
              >
                {c.label}
              </span>
            </label>
          ))}
        </div>
      )}

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {flat
            .filter((c) => selected.includes(c.id))
            .map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1 bg-brand-100 text-brand-700 text-xs px-2 py-0.5 rounded-full"
              >
                {c.path}
                <button
                  type="button"
                  onClick={() => toggle(c.id)}
                  className="hover:text-brand-900"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
        </div>
      )}
    </div>
  );
}

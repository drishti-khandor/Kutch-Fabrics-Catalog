"use client";
import { ALL_SIZES, SizeOption } from "@/lib/types";
import clsx from "clsx";

interface Props {
  selected: string[];
  onChange: (sizes: string[]) => void;
  disabled?: boolean;
}

export default function SizeEditor({ selected, onChange, disabled }: Props) {
  const toggle = (size: string) => {
    if (disabled) return;
    onChange(
      selected.includes(size) ? selected.filter((s) => s !== size) : [...selected, size]
    );
  };

  return (
    <div className="flex flex-wrap gap-2">
      {ALL_SIZES.map((size) => {
        const active = selected.includes(size);
        return (
          <button
            key={size}
            type="button"
            onClick={() => toggle(size)}
            disabled={disabled}
            className={clsx(
              "px-3 py-1.5 rounded-lg border text-sm font-medium transition-all",
              active
                ? "bg-brand-600 text-white border-brand-600 shadow-sm"
                : "bg-white text-slate-500 border-slate-200 hover:border-brand-400 hover:text-brand-600",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            {size}
          </button>
        );
      })}
    </div>
  );
}

"use client";
import { Category } from "@/lib/types";
import { ChevronRight, Folder, FolderOpen } from "lucide-react";
import { useState } from "react";
import clsx from "clsx";

interface Props {
  categories: Category[];
  selected?: string;
  onSelect: (path: string) => void;
}

function Node({
  cat,
  depth,
  selected,
  onSelect,
}: {
  cat: Category;
  depth: number;
  selected?: string;
  onSelect: (p: string) => void;
}) {
  const [open, setOpen] = useState(depth === 0);
  const hasChildren = cat.children?.length > 0;
  const isSelected = selected === cat.path;

  return (
    <div>
      <button
        onClick={() => {
          onSelect(cat.path);
          if (hasChildren) setOpen((o) => !o);
        }}
        className={clsx(
          "w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm transition-colors text-left",
          isSelected
            ? "bg-brand-100 text-brand-700 font-medium"
            : "text-slate-600 hover:bg-slate-100"
        )}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
      >
        {hasChildren ? (
          <ChevronRight
            size={13}
            className={clsx("transition-transform shrink-0", open && "rotate-90")}
          />
        ) : (
          <span className="w-[13px]" />
        )}
        {open && hasChildren ? (
          <FolderOpen size={14} className="shrink-0 text-brand-500" />
        ) : (
          <Folder size={14} className="shrink-0 text-slate-400" />
        )}
        <span className="truncate">{cat.name}</span>
      </button>

      {open && hasChildren && (
        <div>
          {cat.children.map((c) => (
            <Node key={c.id} cat={c} depth={depth + 1} selected={selected} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CategoryTree({ categories, selected, onSelect }: Props) {
  return (
    <div className="space-y-0.5">
      <button
        onClick={() => onSelect("")}
        className={clsx(
          "w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm transition-colors text-left font-medium",
          !selected ? "bg-brand-100 text-brand-700" : "text-slate-600 hover:bg-slate-100"
        )}
      >
        All Items
      </button>
      {categories.map((c) => (
        <Node key={c.id} cat={c} depth={0} selected={selected} onSelect={onSelect} />
      ))}
    </div>
  );
}

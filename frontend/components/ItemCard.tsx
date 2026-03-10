"use client";
import { useState } from "react";
import Link from "next/link";
import { Item } from "@/lib/types";
import { MapPin, Tag, Download, Trash2 } from "lucide-react";
import clsx from "clsx";

interface Props {
  item: Item;
  /** All colour variants for this product (including `item`). */
  variants?: Item[];
  isAdmin?: boolean;
  onDownload?: (item: Item) => void;
  onDelete?: (item: Item) => void;
}

const SIZE_COLORS: Record<string, string> = {
  XS: "bg-sky-50 text-sky-700 border-sky-200",
  S: "bg-emerald-50 text-emerald-700 border-emerald-200",
  M: "bg-violet-50 text-violet-700 border-violet-200",
  L: "bg-amber-50 text-amber-700 border-amber-200",
  XL: "bg-rose-50 text-rose-700 border-rose-200",
  XXL: "bg-orange-50 text-orange-700 border-orange-200",
  "Free Size": "bg-slate-50 text-slate-600 border-slate-200",
};

function imgFor(item: Item): string | null {
  if (item.model_image_url) return item.model_image_url;
  if (item.image_watermarked) return `/images/${item.image_watermarked}`;
  if (item.image_original) return `/images/${item.image_original}`;
  return null;
}

export default function ItemCard({ item, variants, isAdmin, onDownload, onDelete }: Props) {
  const all = variants && variants.length > 1 ? variants : null;
  const [activeIdx, setActiveIdx] = useState(0);

  const active = all ? all[activeIdx] : item;
  const imgSrc = imgFor(active);

  return (
    <div className="item-card bg-white rounded-2xl border border-slate-100 overflow-hidden group">
      {/* Image */}
      <Link href={`/item/${active.id}`} className="block">
        <div className="relative aspect-[3/4] bg-slate-50 overflow-hidden">
          {imgSrc ? (
            <img
              src={imgSrc}
              alt={active.product_name}
              className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-300">
              <Tag size={40} />
            </div>
          )}
          {active.color && (
            <div className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm text-xs font-medium text-slate-700 px-2 py-0.5 rounded-full border border-slate-200 shadow-sm">
              {active.color}
            </div>
          )}
        </div>
      </Link>

      {/* Info */}
      <div className="p-3 space-y-2">
        <Link href={`/item/${active.id}`} className="block">
          <h3 className="font-semibold text-sm text-slate-900 line-clamp-2 leading-snug">
            {active.product_name}
          </h3>
        </Link>

        {/* Colour swatches */}
        {all && (
          <div className="flex flex-wrap gap-1">
            {all.map((v, i) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setActiveIdx(i)}
                title={v.color || `Variant ${i + 1}`}
                className={clsx(
                  "text-[10px] font-medium px-1.5 py-0.5 rounded-full border transition-colors",
                  i === activeIdx
                    ? "bg-brand-600 text-white border-brand-600"
                    : "bg-white text-slate-500 border-slate-200 hover:border-brand-400"
                )}
              >
                {v.color || `#${i + 1}`}
              </button>
            ))}
          </div>
        )}

        {/* Sizes */}
        {active.sizes_available?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {active.sizes_available.map((s) => (
              <span
                key={s}
                className={clsx(
                  "text-[10px] font-medium px-1.5 py-0.5 rounded border",
                  SIZE_COLORS[s] ?? "bg-slate-50 text-slate-600 border-slate-200"
                )}
              >
                {s}
              </span>
            ))}
          </div>
        )}

        {/* Rack */}
        {active.rack_location && (
          <div className="flex items-center gap-1 text-[11px] text-slate-400">
            <MapPin size={10} />
            Rack {active.rack_location}
          </div>
        )}

        {/* Admin actions — per file/variant */}
        {isAdmin && (
          <div className="flex items-center gap-1 pt-1 border-t border-slate-50">
            {active.model_image_url && (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); onDownload?.(active); }}
                className="flex-1 flex items-center justify-center gap-1 py-1 text-[10px] text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                title="Download model photo"
              >
                <Download size={11} />
                Download
              </button>
            )}
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); onDelete?.(active); }}
              className="flex-1 flex items-center justify-center gap-1 py-1 text-[10px] text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="Delete this variant"
            >
              <Trash2 size={11} />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

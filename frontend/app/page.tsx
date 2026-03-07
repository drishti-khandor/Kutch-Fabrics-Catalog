"use client";
import { useEffect, useState, useCallback } from "react";
import { getCategories, getItems, getItemCount } from "@/lib/api";
import { Category, Item } from "@/lib/types";
import CategoryTree from "@/components/CategoryTree";
import ItemCard from "@/components/ItemCard";
import SearchBar from "@/components/SearchBar";
import { Layers, RefreshCw } from "lucide-react";

/**
 * Group items by product_id (when set) or product_name as fallback.
 * Items with the same non-empty product_id are colour variants of one product.
 */
function groupItems(items: Item[]): Map<string, Item[]> {
  const map = new Map<string, Item[]>();
  for (const item of items) {
    const key = item.product_id?.trim() ? item.product_id.trim() : `__name__${item.product_name}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return map;
}

export default function HomePage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [selectedCat, setSelectedCat] = useState("");
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (catPath: string) => {
    setLoading(true);
    try {
      const [data, count] = await Promise.all([
        getItems({ category_path: catPath || undefined, limit: 200 }),
        getItemCount(),
      ]);
      setItems(data);
      setTotalCount(count.count);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    getCategories().then(setCategories);
    load("");
  }, [load]);

  const handleCatSelect = (path: string) => {
    setSelectedCat(path);
    load(path);
  };

  const grouped = groupItems(items);

  return (
    <div className="flex gap-6 min-h-[calc(100vh-4rem)]">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 hidden lg:block">
        <div className="sticky top-20 bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Browse</p>
          <CategoryTree
            categories={categories}
            selected={selectedCat}
            onSelect={handleCatSelect}
          />
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
          <div className="flex-1">
            <SearchBar />
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Layers size={14} />
            <span>{totalCount.toLocaleString()} items</span>
            <button
              onClick={() => load(selectedCat)}
              className="ml-1 p-1 rounded-lg hover:bg-slate-100 transition-colors"
              title="Refresh"
            >
              <RefreshCw size={13} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-100 overflow-hidden animate-pulse">
                <div className="aspect-[3/4] bg-slate-100" />
                <div className="p-3 space-y-2">
                  <div className="h-3 bg-slate-100 rounded w-3/4" />
                  <div className="h-3 bg-slate-100 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400">
            <Layers size={40} className="mb-3 opacity-30" />
            <p className="font-medium">No items yet</p>
            <p className="text-sm mt-1">Upload products from the admin panel</p>
          </div>
        ) : (
          <div className="space-y-10">
            {Array.from(grouped.entries()).map(([_key, colorVariants]) => {
              const groupName = colorVariants[0].product_name;
              const isGrouped = colorVariants.length > 1;
              return (
                <section key={_key}>
                  <h2 className="text-base font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    {groupName}
                    {isGrouped && (
                      <span className="text-xs font-normal text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                        {colorVariants.length} colours
                      </span>
                    )}
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
                    {isGrouped ? (
                      /* Show one card for the whole group with in-card colour switcher */
                      <ItemCard
                        key={colorVariants[0].id}
                        item={colorVariants[0]}
                        variants={colorVariants}
                      />
                    ) : (
                      colorVariants.map((item) => (
                        <ItemCard key={item.id} item={item} />
                      ))
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";
import { useEffect, useState, useCallback } from "react";
import {
  getCategories,
  getItems,
  getItemCount,
  deleteItem,
  bulkDeleteItems,
  downloadModelPhoto,
  downloadModelPhotosZip,
} from "@/lib/api";
import { Category, Item } from "@/lib/types";
import CategoryTree from "@/components/CategoryTree";
import ItemCard from "@/components/ItemCard";
import SearchBar from "@/components/SearchBar";
import { Layers, RefreshCw, Download, Trash2, Loader2, FolderOpen } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

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
  const { user } = useAuth();
  const isAdmin = user?.is_admin ?? false;

  // Folder-level loading states
  const [folderDeleting, setFolderDeleting] = useState(false);
  const [folderDownloading, setFolderDownloading] = useState(false);
  // Product group loading states: key → "del" | "dl" | null
  const [groupLoading, setGroupLoading] = useState<Record<string, "del" | "dl">>({});

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

  // ── File/variant level ──────────────────────────────────
  const handleDeleteVariant = async (item: Item) => {
    if (!confirm(`Delete "${item.product_name}"${item.color ? ` (${item.color})` : ""}?`)) return;
    await deleteItem(item.id);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
  };

  const handleDownloadVariant = (item: Item) => {
    if (item.model_image_url) downloadModelPhoto(item.id);
  };

  // ── Product group level ─────────────────────────────────
  const handleDeleteGroup = async (groupKey: string, variants: Item[]) => {
    if (!confirm(`Delete all ${variants.length} colour variant(s) of "${variants[0].product_name}"?`)) return;
    setGroupLoading((prev) => ({ ...prev, [groupKey]: "del" }));
    try {
      await bulkDeleteItems(variants.map((v) => v.id));
      const ids = new Set(variants.map((v) => v.id));
      setItems((prev) => prev.filter((i) => !ids.has(i.id)));
    } catch {
      alert("Failed to delete product.");
    } finally {
      setGroupLoading((prev) => { const s = { ...prev }; delete s[groupKey]; return s; });
    }
  };

  const handleDownloadGroup = async (groupKey: string, variants: Item[]) => {
    const withPhotos = variants.filter((v) => v.model_image_url);
    if (withPhotos.length === 0) { alert("No model photos for this product."); return; }
    setGroupLoading((prev) => ({ ...prev, [groupKey]: "dl" }));
    try {
      if (withPhotos.length === 1) downloadModelPhoto(withPhotos[0].id);
      else await downloadModelPhotosZip(withPhotos.map((v) => v.id));
    } catch {
      alert("Failed to download model photos.");
    } finally {
      setGroupLoading((prev) => { const s = { ...prev }; delete s[groupKey]; return s; });
    }
  };

  // ── Folder level ────────────────────────────────────────
  const handleFolderDelete = async () => {
    if (!selectedCat || items.length === 0) return;
    if (!confirm(`Delete ALL ${items.length} items in "${selectedCat}"?\nThis cannot be undone.`)) return;
    setFolderDeleting(true);
    try {
      await bulkDeleteItems(items.map((i) => i.id));
      setItems([]);
    } catch {
      alert("Failed to delete all items in folder.");
    } finally {
      setFolderDeleting(false);
    }
  };

  const handleFolderDownload = async () => {
    if (!selectedCat) return;
    setFolderDownloading(true);
    try {
      await downloadModelPhotosZip(undefined, selectedCat);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      alert(
        msg.includes("No model photos")
          ? "No model photos found in this folder."
          : "Failed to download model photos."
      );
    } finally {
      setFolderDownloading(false);
    }
  };

  const grouped = groupItems(items);
  const itemsWithPhotos = items.filter((i) => i.model_image_url).length;

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
        {/* Search + count */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
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

        {/* Folder action bar (admin only, when a category is selected) */}
        {isAdmin && selectedCat && !loading && (
          <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm mb-5">
            <FolderOpen size={15} className="text-amber-500 shrink-0" />
            <span className="font-medium text-amber-800 truncate max-w-xs">{selectedCat}</span>
            <span className="text-amber-600 text-xs">
              {items.length} items · {itemsWithPhotos} with photos
            </span>
            <div className="flex-1" />
            <button
              onClick={handleFolderDownload}
              disabled={folderDownloading || itemsWithPhotos === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-40 transition-colors text-xs font-medium"
            >
              {folderDownloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
              Download All Photos
            </button>
            <button
              onClick={handleFolderDelete}
              disabled={folderDeleting || items.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors text-xs font-medium"
            >
              {folderDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Delete All
            </button>
          </div>
        )}

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
            {Array.from(grouped.entries()).map(([groupKey, colorVariants]) => {
              const groupName = colorVariants[0].product_name;
              const isGrouped = colorVariants.length > 1;
              const groupWithPhotos = colorVariants.filter((v) => v.model_image_url).length;
              const gLoading = groupLoading[groupKey];

              return (
                <section key={groupKey}>
                  {/* Product group header with admin actions */}
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <h2 className="text-base font-semibold text-slate-700">{groupName}</h2>
                    {isGrouped && (
                      <span className="text-xs font-normal text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                        {colorVariants.length} colours
                      </span>
                    )}
                    {/* Product-level admin buttons */}
                    {isAdmin && (
                      <div className="flex items-center gap-1 ml-1">
                        <button
                          onClick={() => handleDownloadGroup(groupKey, colorVariants)}
                          disabled={gLoading === "dl" || groupWithPhotos === 0}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 disabled:opacity-30 transition-colors"
                          title="Download model photos"
                        >
                          {gLoading === "dl" ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Download size={12} />
                          )}
                          {groupWithPhotos > 1 ? "Download All" : "Download"}
                        </button>
                        <button
                          onClick={() => handleDeleteGroup(groupKey, colorVariants)}
                          disabled={gLoading === "del"}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-slate-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-30 transition-colors"
                          title="Delete product and all variants"
                        >
                          {gLoading === "del" ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Trash2 size={12} />
                          )}
                          Delete
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
                    {isGrouped ? (
                      <ItemCard
                        key={colorVariants[0].id}
                        item={colorVariants[0]}
                        variants={colorVariants}
                        isAdmin={isAdmin}
                        onDownload={handleDownloadVariant}
                        onDelete={handleDeleteVariant}
                      />
                    ) : (
                      colorVariants.map((item) => (
                        <ItemCard
                          key={item.id}
                          item={item}
                          isAdmin={isAdmin}
                          onDownload={handleDownloadVariant}
                          onDelete={handleDeleteVariant}
                        />
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

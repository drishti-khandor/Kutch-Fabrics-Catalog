"use client";
import { useEffect, useState, useRef } from "react";
import {
  getItems,
  getCategories,
  updateItem,
  deleteItem,
  bulkDeleteItems,
  downloadModelPhoto,
  downloadModelPhotosZip,
} from "@/lib/api";
import { Item, Category } from "@/lib/types";
import SizeEditor from "@/components/SizeEditor";
import {
  Trash2,
  Pencil,
  Save,
  X,
  Loader2,
  Search,
  Download,
  FolderOpen,
  ChevronDown,
} from "lucide-react";
import clsx from "clsx";

function flattenCategories(
  cats: Category[],
  depth = 0
): { cat: Category; depth: number }[] {
  return cats.flatMap((c) => [
    { cat: c, depth },
    ...flattenCategories(c.children, depth + 1),
  ]);
}

export default function AdminItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<number | null>(null);
  const [editSizes, setEditSizes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const [categories, setCategories] = useState<{ cat: Category; depth: number }[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("");

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [folderDeleting, setFolderDeleting] = useState(false);
  const [folderDownloading, setFolderDownloading] = useState(false);

  const selectAllRef = useRef<HTMLInputElement>(null);

  const load = async (q?: string, catPath?: string) => {
    setLoading(true);
    const data = await getItems({ name: q, category_path: catPath, limit: 500 });
    setItems(data);
    setSelectedIds(new Set());
    setLoading(false);
  };

  useEffect(() => {
    load();
    getCategories().then((cats) => setCategories(flattenCategories(cats)));
  }, []);

  // Sync select-all checkbox indeterminate state
  useEffect(() => {
    if (!selectAllRef.current || items.length === 0) return;
    const all = items.every((i) => selectedIds.has(i.id));
    const some = items.some((i) => selectedIds.has(i.id));
    selectAllRef.current.checked = all;
    selectAllRef.current.indeterminate = some && !all;
  }, [selectedIds, items]);

  const startEdit = (item: Item) => {
    setEditId(item.id);
    setEditSizes(item.sizes_available);
  };
  const cancelEdit = () => setEditId(null);

  const saveSizes = async (item: Item) => {
    setSaving(true);
    const updated = await updateItem(item.id, { sizes_available: editSizes });
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    setEditId(null);
    setSaving(false);
  };

  const handleDelete = async (item: Item) => {
    if (!confirm(`Delete "${item.product_name}"?`)) return;
    await deleteItem(item.id);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    setSelectedIds((prev) => {
      const s = new Set(prev);
      s.delete(item.id);
      return s;
    });
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (!confirm(`Delete ${ids.length} selected item${ids.length !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    setBulkDeleting(true);
    try {
      await bulkDeleteItems(ids);
      setItems((prev) => prev.filter((i) => !selectedIds.has(i.id)));
      setSelectedIds(new Set());
    } catch {
      alert("Failed to delete some items.");
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleBulkDownload = async () => {
    const ids = Array.from(selectedIds).filter((id) =>
      items.find((i) => i.id === id)?.model_image_url
    );
    if (ids.length === 0) {
      alert("None of the selected items have model photos.");
      return;
    }
    setBulkDownloading(true);
    try {
      if (ids.length === 1) {
        downloadModelPhoto(ids[0]);
      } else {
        await downloadModelPhotosZip(ids);
      }
    } catch {
      alert("Failed to download model photos.");
    } finally {
      setBulkDownloading(false);
    }
  };

  const handleFolderDelete = async () => {
    if (!categoryFilter || items.length === 0) return;
    if (
      !confirm(
        `Delete ALL ${items.length} items in "${categoryFilter}"?\nThis cannot be undone.`
      )
    )
      return;
    setFolderDeleting(true);
    try {
      await bulkDeleteItems(items.map((i) => i.id));
      setItems([]);
      setSelectedIds(new Set());
    } catch {
      alert("Failed to delete all items in folder.");
    } finally {
      setFolderDeleting(false);
    }
  };

  const handleFolderDownload = async () => {
    if (!categoryFilter) return;
    setFolderDownloading(true);
    try {
      await downloadModelPhotosZip(undefined, categoryFilter);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(msg.includes("No model photos") ? "No model photos found in this folder." : "Failed to download model photos.");
    } finally {
      setFolderDownloading(false);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  };

  const toggleSelectAll = () => {
    const allSelected = items.length > 0 && items.every((i) => selectedIds.has(i.id));
    setSelectedIds(allSelected ? new Set() : new Set(items.map((i) => i.id)));
  };

  const selectedCount = selectedIds.size;
  const itemsWithPhotos = items.filter((i) => i.model_image_url).length;
  const selectedWithPhotos = items.filter(
    (i) => selectedIds.has(i.id) && i.model_image_url
  ).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">All Items</h1>
        <span className="text-sm text-slate-400">{items.length} items</span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Category dropdown */}
        <div className="relative">
          <FolderOpen
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
          <select
            value={categoryFilter}
            onChange={(e) => {
              const val = e.target.value;
              setCategoryFilter(val);
              load(search || undefined, val || undefined);
            }}
            className="pl-9 pr-8 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white appearance-none cursor-pointer min-w-[180px]"
          >
            <option value="">All categories</option>
            {categories.map(({ cat, depth }) => (
              <option key={cat.id} value={cat.path}>
                {"\u00a0\u00a0".repeat(depth)}
                {cat.name}
              </option>
            ))}
          </select>
          <ChevronDown
            size={13}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              load(e.target.value || undefined, categoryFilter || undefined);
            }}
            placeholder="Filter by name…"
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      {/* Folder action bar */}
      {categoryFilter && !loading && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm">
          <FolderOpen size={15} className="text-amber-500 shrink-0" />
          <span className="font-medium text-amber-800 truncate max-w-[200px]">
            {categoryFilter}
          </span>
          <span className="text-amber-600 text-xs">
            {items.length} items · {itemsWithPhotos} with model photos
          </span>
          <div className="flex-1" />
          <button
            onClick={handleFolderDownload}
            disabled={folderDownloading || itemsWithPhotos === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-40 transition-colors text-xs font-medium"
          >
            {folderDownloading ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Download size={12} />
            )}
            Download All Model Photos
          </button>
          <button
            onClick={handleFolderDelete}
            disabled={folderDeleting || items.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors text-xs font-medium"
          >
            {folderDeleting ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Trash2 size={12} />
            )}
            Delete All in Folder
          </button>
        </div>
      )}

      {/* Bulk action bar */}
      {selectedCount > 0 && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 bg-brand-50 border border-brand-200 rounded-xl text-sm">
          <span className="font-medium text-brand-800">
            {selectedCount} selected
          </span>
          <span className="text-brand-600 text-xs">
            {selectedWithPhotos} with model photos
          </span>
          <div className="flex-1" />
          <button
            onClick={handleBulkDownload}
            disabled={bulkDownloading || selectedWithPhotos === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-brand-300 text-brand-700 hover:bg-brand-50 disabled:opacity-40 transition-colors text-xs font-medium"
          >
            {bulkDownloading ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Download size={12} />
            )}
            Download Model Photos
          </button>
          <button
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors text-xs font-medium"
          >
            {bulkDeleting ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Trash2 size={12} />
            )}
            Delete Selected
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            title="Clear selection"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={28} className="animate-spin text-brand-400" />
        </div>
      ) : (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-50 text-left">
                <th className="px-4 py-3">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    onChange={toggleSelectAll}
                    className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                  />
                </th>
                <th className="px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  Image
                </th>
                <th className="px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  Product
                </th>
                <th className="px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide hidden md:table-cell">
                  Category
                </th>
                <th className="px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  Sizes
                </th>
                <th className="px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map((item) => {
                const imgSrc = item.model_image_url
                  ? item.model_image_url
                  : item.image_watermarked
                  ? `/images/${item.image_watermarked}`
                  : item.image_original
                  ? `/images/${item.image_original}`
                  : null;
                const isEditing = editId === item.id;
                const isSelected = selectedIds.has(item.id);

                return (
                  <tr
                    key={item.id}
                    className={clsx(
                      "hover:bg-slate-50/50 transition-colors",
                      isEditing && "bg-brand-50/30",
                      isSelected && !isEditing && "bg-brand-50/20"
                    )}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(item.id)}
                        className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                      />
                    </td>
                    <td className="px-5 py-3">
                      {imgSrc ? (
                        <img
                          src={imgSrc}
                          alt={item.product_name}
                          className="w-10 h-12 object-cover rounded-lg"
                        />
                      ) : (
                        <div className="w-10 h-12 bg-slate-100 rounded-lg" />
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-800">{item.product_name}</p>
                      {item.color && (
                        <p className="text-xs text-slate-400">{item.color}</p>
                      )}
                      {item.rack_location && (
                        <p className="text-xs text-slate-400">Rack {item.rack_location}</p>
                      )}
                    </td>
                    <td className="px-5 py-3 hidden md:table-cell">
                      <p className="text-xs text-slate-500">{item.category_path}</p>
                    </td>
                    <td className="px-5 py-3">
                      {isEditing ? (
                        <div className="min-w-[280px]">
                          <SizeEditor selected={editSizes} onChange={setEditSizes} />
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {item.sizes_available?.map((s) => (
                            <span
                              key={s}
                              className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5">
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => saveSizes(item)}
                              disabled={saving}
                              className="p-1.5 rounded-lg bg-brand-100 text-brand-600 hover:bg-brand-200 transition-colors"
                            >
                              {saving ? (
                                <Loader2 size={13} className="animate-spin" />
                              ) : (
                                <Save size={13} />
                              )}
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
                            >
                              <X size={13} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => startEdit(item)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                              title="Edit sizes"
                            >
                              <Pencil size={13} />
                            </button>
                            {item.model_image_url && (
                              <button
                                onClick={() => downloadModelPhoto(item.id)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                                title="Download model photo"
                              >
                                <Download size={13} />
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(item)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                              title="Delete item"
                            >
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {items.length === 0 && (
            <div className="text-center py-12 text-slate-400 text-sm">
              No items found
            </div>
          )}
        </div>
      )}
    </div>
  );
}

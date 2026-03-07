"use client";
import { useEffect, useState } from "react";
import { getItems, updateItem, deleteItem } from "@/lib/api";
import { Item } from "@/lib/types";
import SizeEditor from "@/components/SizeEditor";
import { Trash2, Pencil, Save, X, Loader2, Search } from "lucide-react";
import clsx from "clsx";

export default function AdminItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<number | null>(null);
  const [editSizes, setEditSizes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = async (q?: string) => {
    setLoading(true);
    const data = await getItems({ name: q, limit: 200 });
    setItems(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const startEdit = (item: Item) => {
    setEditId(item.id);
    setEditSizes(item.sizes_available);
  };

  const cancelEdit = () => { setEditId(null); };

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
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">All Items</h1>
        <span className="text-sm text-slate-400">{items.length} items</span>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); load(e.target.value || undefined); }}
          placeholder="Filter by name…"
          className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={28} className="animate-spin text-brand-400" />
        </div>
      ) : (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-50 text-left">
                <th className="px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Image</th>
                <th className="px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Product</th>
                <th className="px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide hidden md:table-cell">Category</th>
                <th className="px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Sizes</th>
                <th className="px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map((item) => {
                const imgSrc = item.model_image_url
                  ? item.model_image_url
                  : item.image_watermarked
                  ? `/images/${item.image_watermarked}`
                  : item.image_original ? `/images/${item.image_original}` : null;
                const isEditing = editId === item.id;

                return (
                  <tr key={item.id} className={clsx("hover:bg-slate-50/50 transition-colors", isEditing && "bg-brand-50/30")}>
                    <td className="px-5 py-3">
                      {imgSrc ? (
                        <img src={imgSrc} alt={item.product_name} className="w-10 h-12 object-cover rounded-lg" />
                      ) : (
                        <div className="w-10 h-12 bg-slate-100 rounded-lg" />
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-800">{item.product_name}</p>
                      {item.color && <p className="text-xs text-slate-400">{item.color}</p>}
                      {item.rack_location && <p className="text-xs text-slate-400">Rack {item.rack_location}</p>}
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
                            <span key={s} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">
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
                              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
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
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              onClick={() => handleDelete(item)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
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
            <div className="text-center py-12 text-slate-400 text-sm">No items found</div>
          )}
        </div>
      )}
    </div>
  );
}

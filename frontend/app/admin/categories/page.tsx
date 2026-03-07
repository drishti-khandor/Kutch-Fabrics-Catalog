"use client";
import { useEffect, useState } from "react";
import { getCategories, createCategory, deleteCategory } from "@/lib/api";
import { Category } from "@/lib/types";
import { FolderPlus, Trash2, Loader2, ChevronRight } from "lucide-react";
import clsx from "clsx";

function flattenCats(cats: Category[], depth = 0): { cat: Category; depth: number }[] {
  return cats.flatMap((c) => [{ cat: c, depth }, ...flattenCats(c.children, depth + 1)]);
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [newName, setNewName] = useState("");
  const [parentId, setParentId] = useState<number | "">("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const load = () => getCategories().then(setCategories);
  useEffect(() => { load(); }, []);

  const flat = flattenCats(categories);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError("");
    try {
      await createCategory(newName.trim(), parentId ? Number(parentId) : undefined);
      setNewName("");
      setParentId("");
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (cat: Category) => {
    if (!confirm(`Delete "${cat.name}" and all sub-folders?`)) return;
    try {
      await deleteCategory(cat.id);
      await load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Manage Categories</h1>

      {/* Create form */}
      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-slate-600">Create New Folder</h2>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <form onSubmit={handleCreate} className="flex gap-3">
          <select
            value={parentId}
            onChange={(e) => setParentId(e.target.value ? Number(e.target.value) : "")}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white flex-1"
          >
            <option value="">Root level</option>
            {flat.map(({ cat, depth }) => (
              <option key={cat.id} value={cat.id}>
                {"  ".repeat(depth)}{cat.name}
              </option>
            ))}
          </select>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Folder name…"
            required
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 flex-1"
          />
          <button
            type="submit"
            disabled={creating || !newName.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 transition-colors disabled:opacity-60"
          >
            {creating ? <Loader2 size={14} className="animate-spin" /> : <FolderPlus size={14} />}
            Create
          </button>
        </form>
      </div>

      {/* Tree */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-50">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Folder Tree</p>
        </div>
        <div className="divide-y divide-slate-50">
          {flat.map(({ cat, depth }) => (
            <div
              key={cat.id}
              className="flex items-center justify-between px-5 py-2.5 hover:bg-slate-50 transition-colors"
              style={{ paddingLeft: `${20 + depth * 16}px` }}
            >
              <div className="flex items-center gap-2">
                {depth > 0 && <ChevronRight size={12} className="text-slate-300" />}
                <span className={clsx("text-sm", depth === 0 ? "font-semibold text-slate-800" : "text-slate-600")}>
                  {cat.name}
                </span>
                <span className="text-xs text-slate-300">{cat.path}</span>
              </div>
              <button
                onClick={() => handleDelete(cat)}
                className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

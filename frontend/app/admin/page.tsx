"use client";
import { useEffect, useState } from "react";
import { getItemCount, getItems, getCategories } from "@/lib/api";
import { Item, Category } from "@/lib/types";
import Link from "next/link";
import { Upload, FolderTree, Package, TrendingUp, Clock } from "lucide-react";
import ItemCard from "@/components/ItemCard";

export default function AdminDashboard() {
  const [count, setCount] = useState(0);
  const [catCount, setCatCount] = useState(0);
  const [recent, setRecent] = useState<Item[]>([]);

  useEffect(() => {
    getItemCount().then((r) => setCount(r.count));
    getCategories().then((cats) => {
      const flatten = (list: Category[]): Category[] =>
        list.flatMap((c) => [c, ...flatten(c.children)]);
      setCatCount(flatten(cats).length);
    });
    getItems({ limit: 8 }).then(setRecent);
  }, []);

  const stats = [
    { label: "Total Items", value: count.toLocaleString(), icon: Package, color: "bg-brand-50 text-brand-600" },
    { label: "Categories", value: catCount, icon: FolderTree, color: "bg-emerald-50 text-emerald-600" },
  ];

  const actions = [
    { href: "/admin/upload", label: "Upload Product", icon: Upload, desc: "Add new items with AI tagging" },
    { href: "/admin/categories", label: "Manage Categories", icon: FolderTree, desc: "Create & organise folders" },
    { href: "/admin/items", label: "All Items", icon: Package, desc: "Edit, update & delete stock" },
  ];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center gap-4">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}>
              <Icon size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{value}</p>
              <p className="text-xs text-slate-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Quick Actions</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          {actions.map(({ href, label, icon: Icon, desc }) => (
            <Link
              key={href}
              href={href}
              className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:border-brand-200 hover:shadow-md transition-all group"
            >
              <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center mb-3 group-hover:bg-brand-100 transition-colors">
                <Icon size={18} className="text-brand-600" />
              </div>
              <p className="font-semibold text-slate-800 text-sm">{label}</p>
              <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent uploads */}
      {recent.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <Clock size={13} /> Recent Uploads
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-3">
            {recent.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

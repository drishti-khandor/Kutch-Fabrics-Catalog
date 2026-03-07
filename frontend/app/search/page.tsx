"use client";
import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { textSearch, visualSearch } from "@/lib/api";
import { Item } from "@/lib/types";
import SearchBar from "@/components/SearchBar";
import ItemCard from "@/components/ItemCard";
import { Search, ImageIcon, Loader2 } from "lucide-react";

function SearchContent() {
  const searchParams = useSearchParams();
  const q = searchParams.get("q") || "";

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"text" | "visual">("text");
  const [visualPreview, setVisualPreview] = useState<string | null>(null);
  const [error, setError] = useState("");

  const doTextSearch = useCallback(async (query: string) => {
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    setMode("text");
    try {
      const res = await textSearch(query);
      setItems(res.items);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (q) doTextSearch(q);
  }, [q, doTextSearch]);

  const handleVisualSearch = async (file: File) => {
    setLoading(true);
    setError("");
    setMode("visual");
    setVisualPreview(URL.createObjectURL(file));
    try {
      const res = await visualSearch(file);
      setItems(res.items);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search bar */}
      <div className="flex justify-center">
        <SearchBar defaultValue={q} onVisualSearch={handleVisualSearch} />
      </div>

      {/* Visual preview */}
      {mode === "visual" && visualPreview && (
        <div className="flex items-center gap-4 bg-white border border-slate-100 rounded-2xl p-4 shadow-sm max-w-sm">
          <img src={visualPreview} alt="Query" className="w-16 h-16 object-cover rounded-xl" />
          <div>
            <p className="text-sm font-medium text-slate-700">Visual search</p>
            <p className="text-xs text-slate-400">Finding similar items…</p>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 size={32} className="animate-spin text-brand-500" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 rounded-xl p-4 text-sm">{error}</div>
      )}

      {/* Results */}
      {!loading && items.length > 0 && (
        <div>
          <p className="text-sm text-slate-500 mb-4">
            {items.length} result{items.length !== 1 ? "s" : ""}
            {mode === "text" && q ? ` for "${q}"` : ""}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
            {items.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && items.length === 0 && (q || mode === "visual") && (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400">
          <Search size={40} className="mb-3 opacity-30" />
          <p className="font-medium">No results found</p>
          <p className="text-sm mt-1">Try different keywords or upload a photo</p>
        </div>
      )}

      {/* Initial state */}
      {!loading && !error && items.length === 0 && !q && mode === "text" && (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400">
          <div className="flex gap-6 mb-4">
            <div className="flex flex-col items-center gap-1">
              <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center">
                <Search size={18} className="text-brand-500" />
              </div>
              <span className="text-xs">Keyword</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center">
                <span className="text-brand-500 text-base">🎤</span>
              </div>
              <span className="text-xs">Voice</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center">
                <ImageIcon size={18} className="text-brand-500" />
              </div>
              <span className="text-xs">Visual</span>
            </div>
          </div>
          <p className="font-medium">Search your catalog</p>
          <p className="text-sm mt-1">Type, speak, or upload a photo</p>
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchContent />
    </Suspense>
  );
}

"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getItem, updateItem, deleteItem, downloadModelPhoto, regenerateModelPhoto, getItemsByProductId } from "@/lib/api";
import { Item } from "@/lib/types";
import SizeEditor from "@/components/SizeEditor";
import { ArrowLeft, MapPin, Tag, Trash2, Save, Loader2, Sparkles, Palette, Download } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function ItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<Item | null>(null);
  const [siblings, setSiblings] = useState<Item[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenProductId, setRegenProductId] = useState("");
  const [regenMsg, setRegenMsg] = useState("");
  const { user } = useAuth();

  useEffect(() => {
    getItem(Number(id)).then((i) => {
      setItem(i);
      setSizes(i.sizes_available);
      if (i.product_id?.trim()) {
        getItemsByProductId(i.product_id).then((all) =>
          setSiblings(all.filter((s) => s.id !== i.id))
        );
      } else {
        setSiblings([]);
      }
    });
  }, [id]);

  const handleSaveSizes = async () => {
    if (!item) return;
    setSaving(true);
    try {
      const updated = await updateItem(item.id, { sizes_available: sizes });
      setItem(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerate = async () => {
    if (!item) return;
    setRegenerating(true);
    setRegenMsg("");
    try {
      await regenerateModelPhoto(item.id, regenProductId || undefined);
      setRegenMsg("Model photo generation started — refresh in ~30 seconds to see the result.");
    } catch (err: any) {
      setRegenMsg(`Error: ${err.message}`);
    } finally {
      setRegenerating(false);
    }
  };

  const handleDelete = async () => {
    if (!item) return;
    if (!confirm(`Delete "${item.product_name}"? This cannot be undone.`)) return;
    setDeleting(true);
    await deleteItem(item.id);
    router.push("/");
  };

  if (!item) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 size={32} className="animate-spin text-brand-500" />
      </div>
    );
  }

  const imgSrc = item.model_image_url
    ? item.model_image_url
    : item.image_watermarked
    ? `/images/${item.image_watermarked}`
    : item.image_original
    ? `/images/${item.image_original}`
    : null;

  return (
    <div className="max-w-4xl mx-auto">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-6 transition-colors"
      >
        <ArrowLeft size={15} /> Back
      </button>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Image */}
        <div className="rounded-2xl overflow-hidden border border-slate-100 shadow-sm bg-white aspect-[3/4]">
          {imgSrc ? (
            <img src={imgSrc} alt={item.product_name} className="w-full h-full object-contain" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-200">
              <Tag size={60} />
            </div>
          )}
        </div>

        {/* Details */}
        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-brand-500 uppercase tracking-wide">
                {item.category_path}
              </p>
              {item.product_id?.trim() && (
                <span className="text-xs font-mono font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                  {item.product_id}
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-slate-900">{item.product_name}</h1>
            {item.color && (
              <p className="text-slate-500 mt-1">{item.color}</p>
            )}
          </div>

          {item.description && (
            <p className="text-sm text-slate-600 leading-relaxed">{item.description}</p>
          )}

          {/* Other colour variants of this product */}
          {siblings.length > 0 && (
            <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm space-y-2">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                <Palette size={14} className="text-brand-500" /> Other Colours
              </h3>
              <div className="flex flex-wrap gap-2">
                {siblings.map((s) => (
                  <a
                    key={s.id}
                    href={`/item/${s.id}`}
                    className="flex items-center gap-1.5 text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 hover:border-brand-400 hover:bg-brand-50 transition-colors"
                  >
                    {s.model_image_url ? (
                      <img src={s.model_image_url} alt={s.color} className="w-6 h-6 rounded object-cover" />
                    ) : null}
                    <span className="font-medium text-slate-700">{s.color || `Variant ${s.id}`}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {item.rack_location && (
            <div className="flex items-center gap-1.5 text-sm text-slate-500">
              <MapPin size={14} className="text-brand-400" />
              Rack {item.rack_location}
            </div>
          )}

          {/* Sizes */}
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">Available Sizes</h3>
            <SizeEditor selected={sizes} onChange={setSizes} />
            <button
              onClick={handleSaveSizes}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors disabled:opacity-60"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saved ? "Saved!" : "Save Sizes"}
            </button>
          </div>

          {/* Tags */}
          {item.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {item.tags.map((tag) => (
                <span key={tag} className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Admin-only actions */}
          {user?.is_admin && (
            <>
              {/* Download model photo */}
              {item.model_image_url && (
                <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                  <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5 mb-3">
                    <Download size={14} className="text-emerald-500" /> AI Model Photo
                  </h3>
                  <button
                    onClick={() => downloadModelPhoto(item.id)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-sm font-medium hover:bg-emerald-100 transition-colors"
                  >
                    <Download size={14} />
                    Download Model Photo
                  </button>
                </div>
              )}

              {/* Generate AI Model Photo */}
              <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-3">
                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                  <Sparkles size={14} className="text-brand-500" /> Regenerate AI Model Photo
                </h3>
                <p className="text-xs text-slate-400">
                  Replace this image with a Gemini-generated model photo.
                  Refresh the page after ~30 seconds to see it.
                </p>
                <div className="flex gap-2 items-center">
                  <input
                    value={regenProductId}
                    onChange={(e) => setRegenProductId(e.target.value)}
                    placeholder={`Product ID (default: ${item.id})`}
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <button
                    onClick={handleRegenerate}
                    disabled={regenerating}
                    className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors disabled:opacity-60 whitespace-nowrap"
                  >
                    {regenerating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    {regenerating ? "Queuing…" : "Generate"}
                  </button>
                </div>
                {regenMsg && (
                  <p className={`text-xs ${regenMsg.startsWith("Error") ? "text-red-500" : "text-emerald-600"}`}>
                    {regenMsg}
                  </p>
                )}
              </div>

              {/* Delete */}
              <div className="pt-4 border-t border-slate-100">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-600 border border-red-100 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors disabled:opacity-60"
                >
                  {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  Delete Item
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Category, AIAnalysis } from "@/lib/types";
import { analyseImage, previewModelImage, uploadItem } from "@/lib/api";
import SizeEditor from "@/components/SizeEditor";
import CategoryPicker, { flattenCats } from "./CategoryPicker";
import {
  Upload,
  Sparkles,
  Loader2,
  CheckCircle,
  Wand2,
  RotateCcw,
  Plus,
  AlertCircle,
  RefreshCcw,
  X,
} from "lucide-react";
import clsx from "clsx";

// ── Types ────────────────────────────────────────────────────

interface ModelState {
  generating: boolean;
  prompt: string;
  editablePrompt: string;
  urls: string[];
  selectedIdx: number;
  /** The product ID that was embedded as a badge when this image was generated.
   *  Empty string means no badge was baked in yet. */
  generatedWithProductId: string;
}

const initModel = (): ModelState => ({
  generating: false,
  prompt: "",
  editablePrompt: "",
  urls: [],
  selectedIdx: 0,
  generatedWithProductId: "",
});

interface ColorVariant {
  id: string;
  file: File;
  preview: string;
  color: string;
  sizes: string[];
  rack: string;
  analysing: boolean;
  model: ModelState;
  saving: boolean;
  saved: boolean;
  error: string;
}

function makeVariant(file: File): ColorVariant {
  return {
    id: Math.random().toString(36).slice(2),
    file,
    preview: URL.createObjectURL(file),
    color: "",
    sizes: [],
    rack: "",
    analysing: false,
    model: initModel(),
    saving: false,
    saved: false,
    error: "",
  };
}

// ── Variant Card ─────────────────────────────────────────────

interface VariantCardProps {
  variant: ColorVariant;
  variantNumber: number;
  canRemove: boolean;
  onRemove: () => void;
  onChange: (updates: Partial<ColorVariant>) => void;
  onRegenerate: () => void;
  onPromptChange: (p: string) => void;
  onSelectVersion: (idx: number) => void;
}

function VariantCard({
  variant,
  variantNumber,
  canRemove,
  onRemove,
  onChange,
  onRegenerate,
  onPromptChange,
  onSelectVersion,
}: VariantCardProps) {
  const hasModel = variant.model.urls.length > 0;
  const currentModelUrl = variant.model.urls[variant.model.selectedIdx];

  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4">
      {/* Card header */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center shrink-0">
            {variantNumber}
          </span>
          Color Variant {variantNumber}
          {variant.saved && (
            <span className="flex items-center gap-1 text-xs text-green-600 font-normal">
              <CheckCircle size={12} /> Saved
            </span>
          )}
        </h4>
        {canRemove && !variant.saved && (
          <button
            type="button"
            onClick={onRemove}
            className="w-6 h-6 flex items-center justify-center border border-slate-200 rounded-full hover:bg-red-50 hover:border-red-200 transition-colors"
          >
            <X size={12} />
          </button>
        )}
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        {/* Left: photos */}
        <div className="space-y-3">
          {/* Product photo */}
          <div>
            <p className="text-xs font-semibold text-slate-400 mb-1.5">Product Photo</p>
            <div className="relative">
              <img
                src={variant.preview}
                alt="Product"
                className="w-full rounded-xl object-cover border border-slate-100 max-h-52"
              />
              {variant.analysing && (
                <div className="absolute inset-0 bg-white/75 rounded-xl flex flex-col items-center justify-center gap-2">
                  <Loader2 size={18} className="animate-spin text-brand-500" />
                  <p className="text-xs text-brand-600 font-medium">Analysing…</p>
                </div>
              )}
            </div>
          </div>

          {/* Model photo (auto-appears once generation starts) */}
          {(hasModel || variant.model.generating) && (
            <div>
              <p className="text-xs font-semibold text-slate-400 mb-1.5 flex items-center gap-1.5">
                <Wand2 size={10} className="text-purple-500" /> AI Model Photo
              </p>
              <div className="relative">
                {hasModel && (
                  <img
                    src={currentModelUrl}
                    alt="Model"
                    className="w-full rounded-xl object-cover border border-purple-100 max-h-52"
                  />
                )}
                {variant.model.generating && (
                  <div
                    className={clsx(
                      "flex flex-col items-center justify-center gap-2",
                      hasModel
                        ? "absolute inset-0 bg-white/75 rounded-xl"
                        : "h-44 bg-purple-50 rounded-xl border border-purple-100"
                    )}
                  >
                    <Loader2 size={18} className="animate-spin text-purple-500" />
                    <p className="text-xs text-purple-600 font-medium">Generating AI model…</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: form fields */}
        <div className="sm:col-span-2 space-y-3">
          {variant.error && (
            <div className="bg-red-50 border border-red-100 text-red-600 rounded-lg px-3 py-2 text-xs flex items-center gap-1.5">
              <AlertCircle size={12} className="shrink-0" /> {variant.error}
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Color</label>
            <input
              value={variant.color}
              onChange={(e) => onChange({ color: e.target.value })}
              placeholder="e.g. Royal Blue"
              disabled={variant.saved}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Rack Location</label>
            <input
              value={variant.rack}
              onChange={(e) => onChange({ rack: e.target.value })}
              placeholder="e.g. 05"
              disabled={variant.saved}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 mb-2 block">
              Sizes Available
            </label>
            <SizeEditor
              selected={variant.sizes}
              onChange={(s) => onChange({ sizes: s })}
              disabled={variant.saved}
            />
          </div>

          {/* Version selector */}
          {hasModel && variant.model.urls.length > 1 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-500">Versions:</span>
              {variant.model.urls.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onSelectVersion(i)}
                  className={clsx(
                    "w-7 h-7 rounded-full text-xs font-bold transition-colors border",
                    variant.model.selectedIdx === i
                      ? "bg-purple-600 text-white border-purple-600"
                      : "bg-white text-slate-600 border-slate-200 hover:border-purple-300"
                  )}
                >
                  v{i + 1}
                </button>
              ))}
            </div>
          )}

          {/* Prompt editor + regenerate — shown automatically after first generation */}
          {hasModel && (
            <>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1.5 block">
                  Prompt{" "}
                  <span className="font-normal text-slate-400">
                    — edit &amp; regenerate for a new variation
                  </span>
                </label>
                <textarea
                  value={variant.model.editablePrompt}
                  onChange={(e) => onPromptChange(e.target.value)}
                  rows={3}
                  disabled={variant.saved}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none font-mono leading-relaxed disabled:opacity-60"
                />
              </div>
              <button
                type="button"
                onClick={onRegenerate}
                disabled={variant.model.generating || variant.saved}
                className="flex items-center gap-2 border border-purple-200 text-purple-600 px-4 py-2 rounded-xl text-sm font-medium hover:bg-purple-50 disabled:opacity-50 transition-colors"
              >
                {variant.model.generating ? (
                  <>
                    <Loader2 size={13} className="animate-spin" /> Regenerating…
                  </>
                ) : (
                  <>
                    <RotateCcw size={13} /> Regenerate with edited prompt
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────

export default function SingleUpload({
  categories,
  initialFile,
  onReset,
}: {
  categories: Category[];
  initialFile: File;
  onReset: () => void;
}) {
  // ── Shared product fields ──────────────────────────────────
  const [productId, setProductId] = useState("");
  const [productName, setProductName] = useState("");
  const [categoryIds, setCategoryIds] = useState<number[]>([]);
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [sharedAnalysing, setSharedAnalysing] = useState(true);

  // ── Refs: stale-closure-safe reads inside async tasks ──────
  const productNameRef = useRef(productName);
  const productIdRef = useRef(productId);
  const categoryIdsRef = useRef(categoryIds);
  const categoriesRef = useRef(categories);
  useEffect(() => { productNameRef.current = productName; }, [productName]);
  useEffect(() => { productIdRef.current = productId; }, [productId]);
  useEffect(() => { categoryIdsRef.current = categoryIds; }, [categoryIds]);
  useEffect(() => { categoriesRef.current = categories; }, [categories]);

  // ── Variant state ──────────────────────────────────────────
  const [variants, setVariants] = useState<ColorVariant[]>(() => [makeVariant(initialFile)]);
  const variantsRef = useRef<ColorVariant[]>([]);
  useEffect(() => { variantsRef.current = variants; }, [variants]);

  const addFileInputRef = useRef<HTMLInputElement>(null);

  // ── Save state ─────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [allSaved, setAllSaved] = useState(false);

  // ── Helpers ────────────────────────────────────────────────
  const updateVariant = useCallback((idx: number, updates: Partial<ColorVariant>) => {
    setVariants((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...updates };
      return next;
    });
  }, []);

  // ── Generate model photo for a variant ────────────────────
  const generateModel = useCallback(async (
    idx: number,
    nameOverride?: string,
    catIdsOverride?: number[],
  ) => {
    const variant = variantsRef.current[idx];
    if (!variant) return;

    const flat = flattenCats(categoriesRef.current);
    const catIds = catIdsOverride ?? categoryIdsRef.current;
    const paths = flat.filter((c) => catIds.includes(c.id)).map((c) => c.path);
    const name = nameOverride ?? productNameRef.current;
    const customPrompt = variantsRef.current[idx]?.model.editablePrompt.trim() || undefined;
    const pid = productIdRef.current || undefined;

    setVariants((prev) => {
      const next = [...prev];
      if (!next[idx]) return prev;
      next[idx] = { ...next[idx], model: { ...next[idx].model, generating: true }, error: "" };
      return next;
    });

    try {
      const result = await previewModelImage(variant.file, name, paths, customPrompt, pid);
      setVariants((prev) => {
        const next = [...prev];
        if (!next[idx]) return prev;
        const curr = next[idx];
        next[idx] = {
          ...curr,
          model: {
            ...curr.model,
            generating: false,
            prompt: result.prompt,
            editablePrompt: curr.model.editablePrompt || result.prompt,
            urls: [...curr.model.urls, result.model_image_url],
            selectedIdx: curr.model.urls.length,
            // Record which product ID was baked into this generation
            generatedWithProductId: productIdRef.current,
          },
        };
        return next;
      });
    } catch (err: any) {
      setVariants((prev) => {
        const next = [...prev];
        if (!next[idx]) return prev;
        next[idx] = {
          ...next[idx],
          model: { ...next[idx].model, generating: false },
          error: err.message || "Model generation failed. Try regenerating.",
        };
        return next;
      });
    }
  }, []);

  // ── Analyse a variant then auto-generate model ─────────────
  const analyseAndGenerate = useCallback(async (idx: number, isFirst: boolean) => {
    setVariants((prev) => {
      const next = [...prev];
      if (!next[idx]) return prev;
      next[idx] = { ...next[idx], analysing: true };
      return next;
    });

    let nameForGen = productNameRef.current;
    let catIdsForGen = categoryIdsRef.current;

    try {
      const variant = variantsRef.current[idx];
      const ai: AIAnalysis = await analyseImage(variant.file);

      if (isFirst) {
        // Strip colour words from the shared product name — colour lives in the variant's colour field
        const cleanName = ai.product_name
          .replace(/\b(red|blue|green|yellow|orange|purple|pink|white|black|grey|gray|brown|navy|maroon|indigo|violet|golden|silver|cream|beige|olive|turquoise|coral|teal|cyan|magenta|rose|lilac|lavender|rust|mustard|tan|ivory|champagne|burgundy|wine|peach|mint|emerald|cobalt|multicolou?r|multi)\b/gi, "")
          .replace(/\band\b|\bor\b/gi, "")
          .replace(/\s+/g, " ")
          .trim() || ai.product_name; // fallback to original if stripping empties it
        setProductName(cleanName);
        setDescription(ai.description);
        setTags(ai.tags.join(", "));
        nameForGen = cleanName;

        const flat = flattenCats(categoriesRef.current);
        const lastSegment = (ai.suggested_category || "").split("/").pop()?.toLowerCase() || "";
        const match = flat.find((c) => c.label.toLowerCase() === lastSegment);
        if (match) {
          setCategoryIds([match.id]);
          catIdsForGen = [match.id];
        }
        setSharedAnalysing(false);
      }

      setVariants((prev) => {
        const next = [...prev];
        if (!next[idx]) return prev;
        next[idx] = { ...next[idx], analysing: false, color: ai.color };
        return next;
      });
    } catch {
      setVariants((prev) => {
        const next = [...prev];
        if (!next[idx]) return prev;
        next[idx] = { ...next[idx], analysing: false };
        return next;
      });
      if (isFirst) setSharedAnalysing(false);
    }

    // Auto-generate model photo immediately after analysis completes
    await generateModel(
      idx,
      nameForGen || undefined,
      catIdsForGen.length > 0 ? catIdsForGen : undefined,
    );
  }, [generateModel]);

  // Auto-analyse first variant on mount
  useEffect(() => {
    analyseAndGenerate(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Add more colour variants ───────────────────────────────
  const addColorVariants = useCallback((files: FileList | File[]) => {
    const newFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (newFiles.length === 0) return;

    const startIdx = variantsRef.current.length;
    const newVariants = newFiles.map(makeVariant);

    // Update ref before starting async tasks so they can read new entries
    variantsRef.current = [...variantsRef.current, ...newVariants];
    setVariants((prev) => [...prev, ...newVariants]);

    newFiles.forEach((_, i) => {
      analyseAndGenerate(startIdx + i, false);
    });
  }, [analyseAndGenerate]);

  // ── Save all unsaved variants ──────────────────────────────
  const saveAll = async () => {
    if (!productName) return;
    setSaving(true);

    for (let idx = 0; idx < variantsRef.current.length; idx++) {
      const variant = variantsRef.current[idx];
      if (variant.saved) continue;

      setVariants((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], saving: true, error: "" };
        return next;
      });

      try {
        const fd = new FormData();
        fd.append("file", variant.file);
        fd.append("product_name", productName);
        fd.append("color", variant.color);
        fd.append("sizes_available", variant.sizes.join(","));
        fd.append("rack_location", variant.rack);
        fd.append("description", description);
        fd.append("tags", tags);
        fd.append("product_id", productId);
        fd.append("category_ids", categoryIds.join(","));
        const modelUrl = variant.model.urls[variant.model.selectedIdx];
        if (modelUrl) {
          fd.append("model_image_url", modelUrl);
          // Badge was NOT baked in at generation time but product ID is now set →
          // ask the backend to stamp it onto the existing image without regenerating
          const needsBadge =
            productId.trim() !== "" &&
            variant.model.generatedWithProductId === "";
          if (needsBadge) fd.append("apply_badge_to_model", "true");
        }
        await uploadItem(fd);
        setVariants((prev) => {
          const next = [...prev];
          next[idx] = { ...next[idx], saving: false, saved: true };
          return next;
        });
      } catch (err: any) {
        setVariants((prev) => {
          const next = [...prev];
          next[idx] = { ...next[idx], saving: false, error: err.message || "Save failed" };
          return next;
        });
      }
    }

    setSaving(false);
    if (variantsRef.current.every((v) => v.saved)) {
      setAllSaved(true);
    }
  };

  // ── Success screen ─────────────────────────────────────────
  if (allSaved) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-xl p-4">
          <CheckCircle size={18} />
          {variants.length === 1
            ? "Item uploaded successfully!"
            : `${variants.length} colour variants uploaded successfully!`}
        </div>
        <button
          onClick={onReset}
          className="flex items-center gap-2 border border-slate-200 text-slate-600 px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
        >
          Upload another product
        </button>
      </div>
    );
  }

  const unsavedCount = variants.filter((v) => !v.saved).length;

  return (
    <div className="space-y-5">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-600">New Product</h2>
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1.5 text-xs text-slate-500 border border-slate-200 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <RefreshCcw size={11} /> Change photo
        </button>
      </div>

      {/* ── Shared product info ──────────────────────────────── */}
      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-semibold text-slate-700">
            Product Details
            <span className="ml-1.5 text-xs font-normal text-slate-400">
              — shared across all colour variants
            </span>
          </h3>
          {sharedAnalysing ? (
            <span className="flex items-center gap-1.5 text-xs text-brand-600">
              <Loader2 size={12} className="animate-spin" /> Analysing…
            </span>
          ) : productName ? (
            <span className="flex items-center gap-1.5 text-xs text-brand-600 bg-brand-50 px-2.5 py-1 rounded-lg">
              <Sparkles size={12} /> AI auto-filled — review &amp; adjust
            </span>
          ) : null}
        </div>

        {/* Product ID */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <label className="text-xs font-bold text-amber-700 mb-1 block tracking-wide uppercase">
            Product ID
          </label>
          <input
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            placeholder="e.g. A-1042"
            className="w-full bg-white border border-amber-200 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <p className="text-xs text-amber-600 mt-1">
            Same ID groups all colour variants together when browsing — also stamped on model photos
          </p>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1 block">
            Product Name *
          </label>
          <input
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            required
            placeholder="e.g. Rayon Short Kurti"
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1 block">
            Categories
            {categoryIds.length > 1 && (
              <span className="ml-2 text-brand-600 font-normal">· first selected is primary</span>
            )}
          </label>
          <CategoryPicker
            categories={categories}
            selected={categoryIds}
            onChange={setCategoryIds}
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1 block">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Product description…"
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1 block">
            Tags (comma-separated)
          </label>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="e.g. kurti, rayon, casual"
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      {/* ── Colour variants ──────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">
            Colour Variants
            {variants.length > 1 && (
              <span className="ml-2 text-xs font-normal text-slate-400">
                · {variants.length} variants
              </span>
            )}
          </h3>
          <button
            type="button"
            onClick={() => addFileInputRef.current?.click()}
            className="flex items-center gap-1.5 text-xs border border-brand-200 text-brand-600 px-3 py-1.5 rounded-lg hover:bg-brand-50 transition-colors font-medium"
          >
            <Plus size={12} /> Add Colour
          </button>
          <input
            ref={addFileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && addColorVariants(e.target.files)}
          />
        </div>

        {variants.map((variant, idx) => (
          <VariantCard
            key={variant.id}
            variant={variant}
            variantNumber={idx + 1}
            canRemove={variants.length > 1}
            onRemove={() => setVariants((prev) => prev.filter((_, i) => i !== idx))}
            onChange={(updates) => updateVariant(idx, updates)}
            onRegenerate={() => generateModel(idx)}
            onPromptChange={(p) =>
              setVariants((prev) => {
                const next = [...prev];
                next[idx] = { ...next[idx], model: { ...next[idx].model, editablePrompt: p } };
                return next;
              })
            }
            onSelectVersion={(vIdx) =>
              setVariants((prev) => {
                const next = [...prev];
                next[idx] = { ...next[idx], model: { ...next[idx].model, selectedIdx: vIdx } };
                return next;
              })
            }
          />
        ))}
      </div>

      {/* ── Save button ──────────────────────────────────────── */}
      <button
        type="button"
        onClick={saveAll}
        disabled={!productName || saving || variants.every((v) => v.saved)}
        className="w-full flex items-center justify-center gap-2 bg-brand-600 text-white py-3 rounded-xl font-semibold hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
        {saving
          ? "Saving…"
          : unsavedCount > 1
          ? `Save ${unsavedCount} Colour Variants to Catalog`
          : "Save to Catalog"}
      </button>
    </div>
  );
}

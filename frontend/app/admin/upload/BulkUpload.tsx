"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Category, BatchAnalysisGroup } from "@/lib/types";
import { analyseImage, analyseBatchImages, previewModelImage, uploadItem } from "@/lib/api";
import SizeEditor from "@/components/SizeEditor";
import CategoryPicker, { flattenCats } from "./CategoryPicker";
import {
  Upload,
  Sparkles,
  Loader2,
  CheckCircle,
  Wand2,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  RefreshCcw,
} from "lucide-react";
import clsx from "clsx";

// ── Simple concurrency limiter ──────────────────────────────
function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number
): Promise<Array<T | Error>> {
  return new Promise((resolve) => {
    if (tasks.length === 0) { resolve([]); return; }
    const results: Array<T | Error> = new Array(tasks.length);
    let nextIdx = 0;
    let completed = 0;

    const run = async () => {
      while (nextIdx < tasks.length) {
        const i = nextIdx++;
        try { results[i] = await tasks[i](); }
        catch (err) { results[i] = err instanceof Error ? err : new Error(String(err)); }
        completed++;
        if (completed === tasks.length) resolve(results);
      }
    };

    for (let i = 0; i < Math.min(limit, tasks.length); i++) run();
  });
}

function generateProductId(): string {
  return `P-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

// ── Bulk entry type ─────────────────────────────────────────
interface BulkEntry {
  localId: string;
  file: File;
  preview: string;
  analysing: boolean;
  analysed: boolean;
  productName: string;
  color: string;
  categoryIds: number[];
  sizes: string[];
  rack: string;
  description: string;
  tags: string;
  productId: string;
  generatingModel: boolean;
  modelPrompt: string;
  editablePrompt: string;
  modelUrls: string[];       // S3 URLs — used for display and for passing to save
  selectedVersionIdx: number;
  /** Product ID that was baked into the last generated model image. Empty = no badge. */
  modelGeneratedWithProductId: string;
  saving: boolean;
  saved: boolean;
  error: string;
}

function makeEntry(file: File): BulkEntry {
  return {
    localId: Math.random().toString(36).slice(2),
    file,
    preview: URL.createObjectURL(file),
    analysing: false,
    analysed: false,
    productName: "",
    color: "",
    categoryIds: [],
    sizes: [],
    rack: "",
    description: "",
    tags: "",
    productId: "",
    generatingModel: false,
    modelPrompt: "",
    editablePrompt: "",
    modelUrls: [],
    selectedVersionIdx: 0,
    modelGeneratedWithProductId: "",
    saving: false,
    saved: false,
    error: "",
  };
}

export default function BulkUpload({
  categories,
  initialFiles,
  isSarees = false,
  onReset,
}: {
  categories: Category[];
  initialFiles: File[];
  isSarees?: boolean;
  onReset: () => void;
}) {
  const [items, setItems] = useState<BulkEntry[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [genProgress, setGenProgress] = useState<{ done: number; total: number } | null>(null);
  const [saveProgress, setSaveProgress] = useState<{ done: number; total: number } | null>(null);

  // Ref for stale-closure-safe reads inside async tasks
  const itemsRef = useRef<BulkEntry[]>([]);
  useEffect(() => { itemsRef.current = items; }, [items]);

  const thumbnailRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    thumbnailRefs.current[currentIdx]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [currentIdx]);

  const updateItem = useCallback((idx: number, updates: Partial<BulkEntry>) => {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...updates };
      return next;
    });
  }, []);

  // Initialise and auto-analyse on mount
  useEffect(() => {
    if (initialFiles.length === 0) return;

    const newItems = initialFiles.map(makeEntry);
    const allAnalysing = newItems.map((item) => ({ ...item, analysing: true }));
    setItems(allAnalysing);
    itemsRef.current = allAnalysing;

    const flat = flattenCats(categories);

    (async () => {
      let updatedItems = allAnalysing.map((item) => ({ ...item }));
      let batchOk = false;

      // ── Try batch analysis (single Gemini call for all images) ──
      try {
        const groups: BatchAnalysisGroup[] = await analyseBatchImages(initialFiles);

        for (const group of groups) {
          const cat = (group.suggested_category || "").toLowerCase();
          const isSareeGroup =
            isSarees ||
            cat.includes("saree") ||
            cat.includes("sari");
          const sharedPid = (!isSareeGroup && group.indices.length > 1) ? generateProductId() : "";
          const lastSeg = (group.suggested_category || "").split("/").pop()?.toLowerCase() || "";
          const match = flat.find((c) => c.label.toLowerCase() === lastSeg);
          const catIds = match ? [match.id] : [];

          // For non-saree groups: if ANY item has a user-entered product ID, share it across all
          const userEnteredPid = !isSareeGroup
            ? (group.indices
                .map((i) => itemsRef.current[i]?.productId?.trim() || "")
                .find((pid) => pid !== "") || "")
            : "";
          const groupPid = userEnteredPid || sharedPid;

          group.indices.forEach((itemIdx, posInGroup) => {
            if (itemIdx >= updatedItems.length) return;
            updatedItems[itemIdx] = {
              ...updatedItems[itemIdx],
              analysing: false,
              analysed: true,
              productName: group.canonical_name,
              color: group.colors[posInGroup] ?? "",
              description: group.description,
              tags: group.tags.join(", "),
              // Preserve user-selected category if already set
              categoryIds: itemsRef.current[itemIdx]?.categoryIds?.length
                ? itemsRef.current[itemIdx].categoryIds
                : catIds,
              // Sarees: each item keeps its own individually-entered product ID
              productId: isSareeGroup
                ? (itemsRef.current[itemIdx]?.productId?.trim() || "")
                : groupPid,
            };
          });
        }

        // Safety net: mark any items not covered by groups as done
        updatedItems = updatedItems.map((item) =>
          item.analysing ? { ...item, analysing: false, analysed: true } : item
        );

        setItems([...updatedItems]);
        batchOk = true;
      } catch (err) {
        console.warn("Batch analysis failed, falling back to individual:", err);
      }

      // ── Fallback: individual analysis without grouping ──────────
      if (!batchOk) {
        const fallbackTasks = updatedItems.map((_, idx) => async () => {
          try {
            const ai = await analyseImage(initialFiles[idx]);
            const lastSeg = (ai.suggested_category || "").split("/").pop()?.toLowerCase() || "";
            const match = flat.find((c) => c.label.toLowerCase() === lastSeg);
            updatedItems[idx] = {
              ...updatedItems[idx],
              analysing: false,
              analysed: true,
              productName: ai.product_name,
              color: ai.color,
              description: ai.description,
              tags: ai.tags.join(", "),
              // Preserve user-selected category if already set
              categoryIds: itemsRef.current[idx]?.categoryIds?.length
                ? itemsRef.current[idx].categoryIds
                : (match ? [match.id] : []),
            };
          } catch {
            updatedItems[idx] = { ...updatedItems[idx], analysing: false, analysed: true };
          }
          setItems((prev) => {
            const next = [...prev];
            next[idx] = { ...updatedItems[idx] };
            return next;
          });
        });
        await runWithConcurrency(fallbackTasks, 3);
      }

      // Sync ref with final analysed state before model generation
      itemsRef.current = [...updatedItems];

      // ── Auto-generate model photos (3 concurrent) ───────────────
      const genTasks = updatedItems.map((item, idx) => async () => {
        await generateModelForItem(
          idx,
          item.productName || undefined,
          item.categoryIds.length > 0 ? item.categoryIds : undefined,
        );
      });
      runWithConcurrency(genTasks, 3);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generateModelForItem = async (idx: number, nameOverride?: string, catIdsOverride?: number[]) => {
    const item = itemsRef.current[idx];
    const flat = flattenCats(categories);
    const catIds = catIdsOverride ?? item.categoryIds;
    const paths = flat.filter((c) => catIds.includes(c.id)).map((c) => c.path);
    const name = nameOverride ?? item.productName;
    const customPrompt = item.editablePrompt.trim() || undefined;

    updateItem(idx, { generatingModel: true, error: "" });
    try {
      const result = await previewModelImage(item.file, name, paths, customPrompt, item.productId || undefined);
      setItems((prev) => {
        const next = [...prev];
        const curr = next[idx];
        next[idx] = {
          ...curr,
          generatingModel: false,
          modelPrompt: result.prompt,
          editablePrompt: curr.editablePrompt || result.prompt,
          modelUrls: [...curr.modelUrls, result.model_image_url],
          selectedVersionIdx: curr.modelUrls.length,
          modelGeneratedWithProductId: item.productId,
        };
        return next;
      });
    } catch (err: any) {
      updateItem(idx, { generatingModel: false, error: err.message || "Generation failed" });
    }
  };

  const generateAll = async () => {
    const flat = flattenCats(categories);
    const snapshot = itemsRef.current;
    const todoIdxs = snapshot
      .map((_, i) => i)
      .filter((i) => snapshot[i].modelUrls.length === 0 && !snapshot[i].generatingModel && !snapshot[i].saved);

    if (todoIdxs.length === 0) return;
    let done = 0;
    setGenProgress({ done: 0, total: todoIdxs.length });

    const tasks = todoIdxs.map((idx) => async () => {
      const item = itemsRef.current[idx];
      const paths = flat.filter((c) => item.categoryIds.includes(c.id)).map((c) => c.path);

      setItems((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], generatingModel: true, error: "" };
        return next;
      });
      try {
        const result = await previewModelImage(item.file, item.productName, paths, undefined, item.productId || undefined);
        setItems((prev) => {
          const next = [...prev];
          const curr = next[idx];
          next[idx] = {
            ...curr,
            generatingModel: false,
            modelPrompt: result.prompt,
            editablePrompt: curr.editablePrompt || result.prompt,
            modelUrls: [...curr.modelUrls, result.model_image_url],
            selectedVersionIdx: curr.modelUrls.length,
            modelGeneratedWithProductId: item.productId,
          };
          return next;
        });
      } catch (err: any) {
        setItems((prev) => {
          const next = [...prev];
          next[idx] = { ...next[idx], generatingModel: false, error: err.message || "Generation failed" };
          return next;
        });
      }
      done++;
      setGenProgress({ done, total: todoIdxs.length });
    });

    await runWithConcurrency(tasks, 3);
    setGenProgress(null);
  };

  const saveItem = async (idx: number) => {
    const item = itemsRef.current[idx];
    updateItem(idx, { saving: true, error: "" });
    try {
      const fd = new FormData();
      fd.append("file", item.file);
      fd.append("product_name", item.productName || "Unknown Product");
      fd.append("color", item.color);
      fd.append("sizes_available", item.sizes.join(","));
      fd.append("rack_location", item.rack);
      fd.append("description", item.description);
      fd.append("tags", item.tags);
      fd.append("product_id", item.productId);
      fd.append("category_ids", item.categoryIds.join(","));
      const modelUrl = item.modelUrls[item.selectedVersionIdx];
      if (modelUrl) {
        fd.append("model_image_url", modelUrl);
        // Badge not baked in at generation time but product ID is now set → stamp it server-side
        const needsBadge =
          item.productId.trim() !== "" &&
          item.modelGeneratedWithProductId === "";
        if (needsBadge) fd.append("apply_badge_to_model", "true");
      }
      await uploadItem(fd);
      updateItem(idx, { saving: false, saved: true });
    } catch (err: any) {
      updateItem(idx, { saving: false, error: err.message || "Save failed" });
    }
  };

  const saveAll = async () => {
    const snapshot = itemsRef.current;
    const todoIdxs = snapshot
      .map((_, i) => i)
      .filter((i) => !snapshot[i].saved && !snapshot[i].saving && snapshot[i].productName);

    if (todoIdxs.length === 0) return;
    let done = 0;
    setSaveProgress({ done: 0, total: todoIdxs.length });

    const tasks = todoIdxs.map((idx) => async () => {
      await saveItem(idx);
      done++;
      setSaveProgress({ done, total: todoIdxs.length });
    });

    await runWithConcurrency(tasks, 5);
    setSaveProgress(null);
  };

  const current = items[currentIdx];
  const totalAnalysed = items.filter((it) => it.analysed).length;
  const totalGenerated = items.filter((it) => it.modelUrls.length > 0).length;
  const totalSaved = items.filter((it) => it.saved).length;
  const totalErrors = items.filter((it) => it.error && !it.saved).length;
  const isBusy = !!genProgress || !!saveProgress;

  return (
    <div className="space-y-4">
      {/* Navigation header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
            disabled={currentIdx === 0}
            className="w-8 h-8 flex items-center justify-center border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-30 transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-bold text-slate-700 min-w-[4.5rem] text-center">
            {currentIdx + 1} / {items.length}
          </span>
          <button
            onClick={() => setCurrentIdx((i) => Math.min(items.length - 1, i + 1))}
            disabled={currentIdx === items.length - 1}
            className="w-8 h-8 flex items-center justify-center border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-30 transition-colors"
          >
            <ChevronRight size={16} />
          </button>

          <button
            onClick={onReset}
            title="Upload different photos"
            className="ml-2 flex items-center gap-1.5 text-xs text-slate-500 border border-slate-200 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <RefreshCcw size={11} /> Change photos
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <Sparkles size={10} className="text-blue-400" />
            {totalAnalysed}/{items.length} analysed
          </span>
          <span className="flex items-center gap-1">
            <Wand2 size={10} className="text-purple-400" />
            {totalGenerated}/{items.length} generated
          </span>
          <span className="flex items-center gap-1">
            <CheckCircle size={10} className="text-green-400" />
            {totalSaved}/{items.length} saved
          </span>
          {totalErrors > 0 && (
            <span className="flex items-center gap-1 text-red-400">
              <AlertCircle size={10} /> {totalErrors} errors
            </span>
          )}
        </div>
      </div>

      {/* Thumbnail strip */}
      <div className="flex gap-2 overflow-x-auto pb-1 px-0.5 -mx-0.5">
        {items.map((item, idx) => (
          <button
            key={item.localId}
            ref={(el) => { thumbnailRefs.current[idx] = el; }}
            type="button"
            onClick={() => setCurrentIdx(idx)}
            className={clsx(
              "relative shrink-0 w-[72px] h-[72px] rounded-xl overflow-hidden border-2 transition-all",
              idx === currentIdx
                ? "border-brand-500 ring-2 ring-brand-200 scale-105"
                : "border-slate-200 hover:border-brand-300"
            )}
          >
            <img src={item.preview} alt="" className="w-full h-full object-cover" />

            {/* Status dot */}
            <div className="absolute bottom-1 right-1">
              {item.saving && <Loader2 size={11} className="text-white drop-shadow animate-spin" />}
              {item.saved && <div className="w-3 h-3 rounded-full bg-green-400 border-2 border-white shadow" />}
              {item.generatingModel && !item.saved && <Loader2 size={11} className="text-purple-300 drop-shadow animate-spin" />}
              {item.modelUrls.length > 0 && !item.saved && !item.generatingModel && (
                <div className="w-3 h-3 rounded-full bg-purple-400 border-2 border-white shadow" />
              )}
              {item.analysing && (
                <Loader2 size={11} className="text-blue-300 drop-shadow animate-spin" />
              )}
              {item.error && !item.saved && (
                <div className="w-3 h-3 rounded-full bg-red-400 border-2 border-white shadow" />
              )}
            </div>

            {/* Product ID badge */}
            {item.productId && (
              <div className="absolute top-1 left-1 bg-black/60 text-white text-[8px] font-bold px-1 rounded leading-tight">
                {item.productId}
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Current item — two-column layout */}
      {current && (
        <div className="grid grid-cols-5 gap-4">
          {/* Left — image panel (2/5) */}
          <div className="col-span-2 space-y-3">
            {current.modelUrls.length > 0 ? (
              <>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-semibold text-slate-500">Model Photo</p>
                    {current.modelUrls.length > 1 && (
                      <div className="flex items-center gap-1">
                        {current.modelUrls.map((_, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => updateItem(currentIdx, { selectedVersionIdx: i })}
                            className={clsx(
                              "w-6 h-6 rounded-full text-xs font-bold transition-colors border",
                              current.selectedVersionIdx === i
                                ? "bg-purple-600 text-white border-purple-600"
                                : "bg-white text-slate-500 border-slate-200 hover:border-purple-300"
                            )}
                          >
                            {i + 1}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <img
                      src={current.modelUrls[current.selectedVersionIdx]}
                      alt="Model photo"
                      className="w-full rounded-xl object-cover border border-slate-100"
                    />
                    {current.generatingModel && (
                      <div className="absolute inset-0 bg-white/70 rounded-xl flex items-center justify-center">
                        <Loader2 size={20} className="animate-spin text-purple-500" />
                      </div>
                    )}
                  </div>

                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-400 mb-1.5">Original</p>
                  <img
                    src={current.preview}
                    alt="Original"
                    className="w-full rounded-xl object-cover border border-slate-100 opacity-60"
                  />
                </div>
              </>
            ) : (
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1.5">Product Photo</p>
                <div className="relative">
                  <img
                    src={current.preview}
                    alt="Preview"
                    className="w-full rounded-xl object-cover border border-slate-100"
                  />
                  {current.analysing && (
                    <div className="absolute inset-0 bg-white/70 rounded-xl flex flex-col items-center justify-center gap-1.5">
                      <Loader2 size={18} className="animate-spin text-brand-500" />
                      <p className="text-xs text-brand-600 font-medium">Analysing…</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right — form panel (3/5) */}
          <div className="col-span-3 space-y-3">
            {current.analysed && !current.analysing && (
              <div className="flex items-center gap-1.5 text-xs text-brand-600 bg-brand-50 px-2.5 py-1 rounded-lg w-fit">
                <Sparkles size={10} /> AI auto-filled — review & adjust
              </div>
            )}

            {current.error && (
              <div className="bg-red-50 border border-red-100 text-red-600 rounded-lg px-3 py-2 text-xs flex items-center gap-1.5">
                <AlertCircle size={12} className="shrink-0" /> {current.error}
              </div>
            )}

            {/* Product ID — prominent */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5">
              <label className="text-[10px] font-bold text-amber-700 mb-1 block uppercase tracking-wide">
                Product ID
              </label>
              <input
                value={current.productId}
                onChange={(e) => updateItem(currentIdx, { productId: e.target.value })}
                placeholder="e.g. A-1042"
                className="w-full bg-white border border-amber-200 rounded-lg px-2.5 py-1.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Product Name *</label>
                <input
                  value={current.productName}
                  onChange={(e) => updateItem(currentIdx, { productName: e.target.value })}
                  placeholder="Product name"
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Color</label>
                <input
                  value={current.color}
                  onChange={(e) => updateItem(currentIdx, { color: e.target.value })}
                  placeholder="Color"
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Categories</label>
              <CategoryPicker
                categories={categories}
                selected={current.categoryIds}
                onChange={(ids) => updateItem(currentIdx, { categoryIds: ids })}
                compact
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Rack Location</label>
                <input
                  value={current.rack}
                  onChange={(e) => updateItem(currentIdx, { rack: e.target.value })}
                  placeholder="e.g. 05"
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-2 block">Sizes</label>
                <SizeEditor
                  selected={current.sizes}
                  onChange={(s) => updateItem(currentIdx, { sizes: s })}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Description</label>
              <textarea
                value={current.description}
                onChange={(e) => updateItem(currentIdx, { description: e.target.value })}
                rows={2}
                placeholder="Product description…"
                className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Tags</label>
              <input
                value={current.tags}
                onChange={(e) => updateItem(currentIdx, { tags: e.target.value })}
                placeholder="tag1, tag2, …"
                className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            {/* Per-item model generation */}
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Show button only after a model exists (regenerate) or if auto-gen failed (retry) */}
                {(current.modelUrls.length > 0 || (!current.generatingModel && !current.analysing && current.analysed)) && (
                  <button
                    type="button"
                    onClick={() => generateModelForItem(currentIdx)}
                    disabled={current.generatingModel || current.saved || !current.productName || isBusy}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
                  >
                    {current.generatingModel ? (
                      <><Loader2 size={11} className="animate-spin" /> Regenerating…</>
                    ) : current.modelUrls.length === 0 ? (
                      <><Wand2 size={11} /> Retry Model Photo</>
                    ) : (
                      <><RotateCcw size={11} /> Regenerate</>
                    )}
                  </button>
                )}

                {current.saved && (
                  <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                    <CheckCircle size={12} /> Saved
                  </span>
                )}
              </div>

              {/* Editable prompt */}
              {current.modelUrls.length > 0 && (
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">
                    Prompt{" "}
                    <span className="text-slate-400">— edit & regenerate for a new variation</span>
                  </label>
                  <textarea
                    value={current.editablePrompt}
                    onChange={(e) => updateItem(currentIdx, { editablePrompt: e.target.value })}
                    rows={3}
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-600 focus:outline-none focus:ring-1 focus:ring-purple-400 resize-none font-mono leading-relaxed"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sticky action bar */}
      <div className="sticky bottom-0 z-10 bg-white/95 backdrop-blur border-t border-slate-100 pt-4 pb-1 space-y-3">
        <div className="flex gap-3">
          {/* Only show "Generate" button for items that failed or were skipped */}
          {items.some((it) => !it.saved && !it.generatingModel && it.modelUrls.length === 0) && (
            <button
              type="button"
              onClick={generateAll}
              disabled={isBusy}
              className="flex-1 flex items-center justify-center gap-2 bg-purple-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-purple-700 disabled:opacity-60 transition-colors"
            >
              {genProgress ? (
                <><Loader2 size={14} className="animate-spin" /> Generating… {genProgress.done}/{genProgress.total}</>
              ) : (
                <><Wand2 size={14} /> Retry Failed Model Photos</>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={saveAll}
            disabled={isBusy || items.every((it) => it.saved)}
            className="flex-1 flex items-center justify-center gap-2 bg-brand-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-brand-700 disabled:opacity-60 transition-colors"
          >
            {saveProgress ? (
              <><Loader2 size={14} className="animate-spin" /> Saving… {saveProgress.done}/{saveProgress.total}</>
            ) : (
              <><Upload size={14} /> Save All to Catalog</>
            )}
          </button>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-400 pb-1">
          <span>{items.length} images loaded</span>
          <span className="flex gap-2">
            {totalSaved > 0 && <span className="text-green-500 font-medium">{totalSaved} saved</span>}
            {totalGenerated - totalSaved > 0 && <span className="text-purple-500">{totalGenerated - totalSaved} ready</span>}
            {items.filter((it) => it.analysing).length > 0 && (
              <span className="text-blue-500">{items.filter((it) => it.analysing).length} analysing…</span>
            )}
            {totalErrors > 0 && <span className="text-red-400">{totalErrors} errors</span>}
          </span>
        </div>
      </div>
    </div>
  );
}

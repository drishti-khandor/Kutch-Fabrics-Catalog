"use client";

import { useEffect, useRef, useState } from "react";
import { getCategories } from "@/lib/api";
import { Category } from "@/lib/types";
import SingleUpload from "./SingleUpload";
import BulkUpload from "./BulkUpload";
import { ImageIcon, Layers, LayoutGrid, Shirt } from "lucide-react";

type UploadMode = "saree-parts" | "bulk" | "different-sarees";

export default function UploadPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadMode, setUploadMode] = useState<UploadMode | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getCategories().then(setCategories);
  }, []);

  const handleFiles = (files: FileList | File[]) => {
    const imageFiles = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .slice(0, 50);
    if (imageFiles.length > 0) {
      setUploadMode(null);
      setSelectedFiles(imageFiles);
    }
  };

  const reset = () => {
    setSelectedFiles([]);
    setUploadMode(null);
  };

  // 2–3 files with no mode chosen yet → disambiguation
  const needsDisambiguation =
    selectedFiles.length >= 2 && selectedFiles.length <= 3 && uploadMode === null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Upload Products</h1>

      {selectedFiles.length === 0 ? (
        /* ── Drop zone ─────────────────────────────────────── */
        <div
          onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-slate-200 rounded-2xl bg-white hover:border-brand-300 h-64 cursor-pointer flex items-center justify-center transition-colors"
        >
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <ImageIcon size={44} className="opacity-25" />
            <div className="text-center">
              <p className="text-sm font-medium text-slate-500">
                Drop one or more product photos here
              </p>
              <p className="text-xs mt-1">Or click to browse — select multiple for bulk upload</p>
            </div>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
        </div>
      ) : needsDisambiguation ? (
        /* ── Disambiguation: same saree vs different products ── */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-700">
                {selectedFiles.length} photos selected
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">How are these photos related?</p>
            </div>
            <button
              onClick={reset}
              className="text-xs text-slate-500 border border-slate-200 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Change photos
            </button>
          </div>

          {/* Thumbnails */}
          <div className="flex gap-3">
            {selectedFiles.map((f, i) => (
              <img
                key={i}
                src={URL.createObjectURL(f)}
                alt={`Photo ${i + 1}`}
                className="w-24 h-24 rounded-xl object-cover border border-slate-100 shadow-sm"
              />
            ))}
          </div>

          <div className="space-y-3">
            {/* Option A: same saree */}
            <button
              type="button"
              onClick={() => setUploadMode("saree-parts")}
              className="group w-full text-left border-2 border-slate-200 hover:border-purple-400 hover:bg-purple-50 rounded-2xl p-4 transition-all"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-100 group-hover:bg-purple-200 flex items-center justify-center shrink-0 transition-colors">
                  <Layers size={18} className="text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700">Parts of the same saree</p>
                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                    Pallu, blouse piece, or design detail — one product, AI uses all photos together
                  </p>
                </div>
              </div>
            </button>

            {/* Option B: different sarees */}
            <button
              type="button"
              onClick={() => setUploadMode("different-sarees")}
              className="group w-full text-left border-2 border-slate-200 hover:border-teal-400 hover:bg-teal-50 rounded-2xl p-4 transition-all"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-teal-100 group-hover:bg-teal-200 flex items-center justify-center shrink-0 transition-colors">
                  <Shirt size={18} className="text-teal-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700">Different sarees</p>
                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                    Each photo is a separate saree — each gets its own catalog entry, no auto-grouping
                  </p>
                </div>
              </div>
            </button>

            {/* Option C: different products */}
            <button
              type="button"
              onClick={() => setUploadMode("bulk")}
              className="group w-full text-left border-2 border-slate-200 hover:border-brand-400 hover:bg-brand-50 rounded-2xl p-4 transition-all"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-brand-100 group-hover:bg-brand-200 flex items-center justify-center shrink-0 transition-colors">
                  <LayoutGrid size={18} className="text-brand-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700">Different products</p>
                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                    Colour variants or separate non-saree items — AI groups similar ones together
                  </p>
                </div>
              </div>
            </button>
          </div>
        </div>
      ) : selectedFiles.length === 1 || uploadMode === "saree-parts" ? (
        /* ── Single upload (or saree parts → SingleUpload) ─── */
        <SingleUpload
          categories={categories}
          initialFile={selectedFiles[0]}
          initialExtraFiles={
            uploadMode === "saree-parts" ? selectedFiles.slice(1) : undefined
          }
          onReset={reset}
        />
      ) : (
        /* ── Bulk upload ───────────────────────────────────── */
        <BulkUpload
          categories={categories}
          initialFiles={selectedFiles}
          isSarees={uploadMode === "different-sarees"}
          onReset={reset}
        />
      )}
    </div>
  );
}

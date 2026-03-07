"use client";

import { useEffect, useRef, useState } from "react";
import { getCategories } from "@/lib/api";
import { Category } from "@/lib/types";
import SingleUpload from "./SingleUpload";
import BulkUpload from "./BulkUpload";
import { ImageIcon } from "lucide-react";

export default function UploadPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getCategories().then(setCategories);
  }, []);

  const handleFiles = (files: FileList | File[]) => {
    const imageFiles = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .slice(0, 50);
    if (imageFiles.length > 0) setSelectedFiles(imageFiles);
  };

  const reset = () => setSelectedFiles([]);

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
      ) : selectedFiles.length === 1 ? (
        /* ── Single upload ─────────────────────────────────── */
        <SingleUpload
          categories={categories}
          initialFile={selectedFiles[0]}
          onReset={reset}
        />
      ) : (
        /* ── Bulk upload ───────────────────────────────────── */
        <BulkUpload
          categories={categories}
          initialFiles={selectedFiles}
          onReset={reset}
        />
      )}
    </div>
  );
}

import { Category, Item, SearchResult, AIAnalysis, BatchAnalysisGroup } from "./types";

const BASE = "/api";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || res.statusText);
  }
  return res.json();
}

// ── Categories ─────────────────────────────────────────────
export const getCategories = () => req<Category[]>("/categories");

export const createCategory = (name: string, parent_id?: number) =>
  req<Category>("/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, parent_id }),
  });

export const deleteCategory = (id: number) =>
  req<{ ok: boolean }>(`/categories/${id}`, { method: "DELETE" });

// ── Items ──────────────────────────────────────────────────
export const getItems = (params?: {
  category_path?: string;
  name?: string;
  color?: string;
  skip?: number;
  limit?: number;
}) => {
  const qs = new URLSearchParams();
  if (params?.category_path) qs.set("category_path", params.category_path);
  if (params?.name) qs.set("name", params.name);
  if (params?.color) qs.set("color", params.color);
  if (params?.skip !== undefined) qs.set("skip", String(params.skip));
  if (params?.limit !== undefined) qs.set("limit", String(params.limit));
  return req<Item[]>(`/items?${qs}`);
};

export const getItem = (id: number) => req<Item>(`/items/${id}`);

export const getItemCount = () => req<{ count: number }>("/items/count");

export const updateItem = (id: number, data: Partial<Item>) =>
  req<Item>(`/items/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const deleteItem = (id: number) =>
  req<{ ok: boolean }>(`/items/${id}`, { method: "DELETE" });

export const getItemsByProductId = (productId: string) =>
  req<Item[]>(`/items/by-product/${encodeURIComponent(productId)}`);

export const regenerateModelPhoto = (id: number, productId?: string) => {
  const qs = productId ? `?product_id=${encodeURIComponent(productId)}` : "";
  return req<{ ok: boolean; message: string }>(`/items/${id}/regenerate-model${qs}`, {
    method: "POST",
  });
};

// ── Search ─────────────────────────────────────────────────
export const textSearch = (query: string, category_path?: string, limit = 50) =>
  req<SearchResult>("/search/text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, category_path, limit }),
  });

export const visualSearch = async (file: File, limit = 20): Promise<SearchResult> => {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("limit", String(limit));
  const res = await fetch(`${BASE}/search/visual`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};

// ── Upload ─────────────────────────────────────────────────
export const analyseImage = async (file: File): Promise<AIAnalysis> => {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${BASE}/upload/analyse`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};

export const previewModelImage = async (
  file: File,
  productName: string,
  categoryPaths: string[],
  customPrompt?: string,
  productId?: string,
): Promise<{ prompt: string; model_image_url: string }> => {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("product_name", productName);
  fd.append("category_paths", categoryPaths.join(","));
  if (customPrompt) fd.append("custom_prompt", customPrompt);
  if (productId) fd.append("product_id", productId);
  const res = await fetch(`${BASE}/upload/preview-model`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};

export const analyseBatchImages = async (files: File[]): Promise<BatchAnalysisGroup[]> => {
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  const res = await fetch(`${BASE}/upload/analyse-batch`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};

export const uploadItem = async (formData: FormData): Promise<Item> => {
  const res = await fetch(`${BASE}/upload/item`, { method: "POST", body: formData });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};

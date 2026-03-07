export interface Category {
  id: number;
  name: string;
  parent_id: number | null;
  path: string;
  children: Category[];
}

export interface Item {
  id: number;
  product_id: string;
  product_name: string;
  category_id: number | null;
  category_path: string;
  extra_category_paths: string[];
  color: string;
  sizes_available: string[];
  rack_location: string;
  description: string;
  tags: string[];
  image_original: string;
  image_watermarked: string;
  model_image_url: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SearchResult {
  items: Item[];
  total: number;
}

export interface AIAnalysis {
  product_name: string;
  color: string;
  description: string;
  tags: string[];
  suggested_category: string;
}

export interface BatchAnalysisGroup {
  indices: number[];
  canonical_name: string;
  suggested_category: string;
  description: string;
  tags: string[];
  colors: string[];
}

export type SizeOption = "XS" | "S" | "M" | "L" | "XL" | "XXL" | "Free Size";
export const ALL_SIZES: SizeOption[] = ["XS", "S", "M", "L", "XL", "XXL", "Free Size"];

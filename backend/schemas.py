from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


# ── Category ──────────────────────────────────────────────
class CategoryCreate(BaseModel):
    name: str
    parent_id: Optional[int] = None


class CategoryOut(BaseModel):
    id: int
    name: str
    parent_id: Optional[int]
    path: str
    children: List["CategoryOut"] = []

    class Config:
        from_attributes = True


CategoryOut.model_rebuild()


# ── Item ───────────────────────────────────────────────────
class ItemCreate(BaseModel):
    product_name: str
    category_id: Optional[int] = None
    category_path: str = ""
    extra_category_paths: List[str] = []
    color: str = ""
    sizes_available: List[str] = []
    rack_location: str = ""
    description: str = ""
    tags: List[str] = []
    image_original: str = ""
    image_watermarked: str = ""


class ItemUpdate(BaseModel):
    product_name: Optional[str] = None
    category_id: Optional[int] = None
    category_path: Optional[str] = None
    extra_category_paths: Optional[List[str]] = None
    color: Optional[str] = None
    sizes_available: Optional[List[str]] = None
    rack_location: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    is_active: Optional[bool] = None


class ItemOut(BaseModel):
    id: int
    product_id: str
    product_name: str
    category_id: Optional[int]
    category_path: str
    extra_category_paths: List[str]
    color: str
    sizes_available: List[str]
    rack_location: str
    description: str
    tags: List[str]
    image_original: str
    image_watermarked: str
    model_image_url: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Search ─────────────────────────────────────────────────
class TextSearchRequest(BaseModel):
    query: str
    category_path: Optional[str] = None
    limit: int = 50


class SearchResult(BaseModel):
    items: List[ItemOut]
    total: int


# ── AI Analysis ────────────────────────────────────────────
class AIAnalysisResult(BaseModel):
    product_name: str
    color: str
    description: str
    tags: List[str]
    suggested_category: str

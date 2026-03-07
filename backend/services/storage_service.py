import shutil
import uuid
from pathlib import Path
from config import get_settings

settings = get_settings()
BASE = Path(settings.catalog_data_path)


def _safe_stem(name: str) -> str:
    return "".join(c if c.isalnum() or c in "._-" else "_" for c in name)


def save_original(file_bytes: bytes, filename: str, category_path: str) -> str:
    """Save raw uploaded image; return path relative to BASE."""
    uid = uuid.uuid4().hex[:8]
    stem = _safe_stem(Path(filename).stem)
    ext = Path(filename).suffix.lower() or ".jpg"
    rel = f"originals/{category_path}/{stem}_{uid}{ext}"
    dest = BASE / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(file_bytes)
    return rel


def watermarked_path(original_rel: str) -> str:
    """Derive watermarked path from original path."""
    p = Path(original_rel)
    # originals/... → watermarked/...
    parts = list(p.parts)
    if parts[0] == "originals":
        parts[0] = "watermarked"
    wm_rel = str(Path(*parts).with_suffix(".jpg"))
    return wm_rel


def abs_path(rel: str) -> str:
    return str(BASE / rel)


def delete_item_files(image_original: str, image_watermarked: str):
    for rel in [image_original, image_watermarked]:
        if rel:
            p = BASE / rel
            if p.exists():
                p.unlink()

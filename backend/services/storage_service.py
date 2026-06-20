import time
import uuid
from pathlib import Path
from config import get_settings

settings = get_settings()
BASE = Path(settings.catalog_data_path)

# Originals/watermarked images are a short-lived working cache, not permanent
# storage — only the AI-generated model photo (S3) is kept long-term. Admins
# only ever need the source photo within ~60 min of upload (regenerate-model,
# size/rack edits), so anything older is safe to prune.
CACHE_TTL_SECONDS = 90 * 60


def _safe_stem(name: str) -> str:
    return "".join(c if c.isalnum() or c in "._-" else "_" for c in name)


def purge_expired(ttl_seconds: int = CACHE_TTL_SECONDS) -> None:
    """Delete cached original/watermarked files older than ttl_seconds."""
    now = time.time()
    for sub in ("originals", "watermarked"):
        root = BASE / sub
        if not root.exists():
            continue
        for f in root.rglob("*"):
            if f.is_file() and now - f.stat().st_mtime > ttl_seconds:
                f.unlink(missing_ok=True)


def save_original(file_bytes: bytes, filename: str, category_path: str) -> str:
    """Cache the raw uploaded image on local disk; return path relative to BASE.
    Not durable — only needed for the short admin workflow right after upload."""
    purge_expired()
    uid = uuid.uuid4().hex[:8]
    stem = _safe_stem(Path(filename).stem)
    ext = Path(filename).suffix.lower() or ".jpg"
    rel = f"originals/{category_path}/{stem}_{uid}{ext}"
    dest = BASE / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(file_bytes)
    return rel


def exists(rel: str) -> bool:
    return rel and (BASE / rel).exists()


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

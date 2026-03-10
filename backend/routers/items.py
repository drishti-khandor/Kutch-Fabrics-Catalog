from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, text
from database import get_db
from models import Item
from schemas import ItemOut, ItemUpdate, BulkDeleteRequest, ModelPhotosZipRequest
from services.watermark_service import apply_watermark
from services.storage_service import abs_path, watermarked_path, delete_item_files
import asyncio
import io
import zipfile
import logging
import httpx

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/items", tags=["items"])


@router.get("", response_model=list[ItemOut])
async def list_items(
    category_path: str | None = Query(None),
    name: str | None = Query(None),
    color: str | None = Query(None),
    active_only: bool = Query(True),
    skip: int = Query(0),
    limit: int = Query(100),
    db: AsyncSession = Depends(get_db),
):
    q = select(Item)
    if active_only:
        q = q.where(Item.is_active == True)
    if category_path:
        # Match primary category OR any of the extra category paths
        q = q.where(or_(
            Item.category_path.like(f"{category_path}%"),
            text(
                "EXISTS ("
                "  SELECT 1 FROM unnest(items.extra_category_paths) AS ep"
                "  WHERE ep LIKE :cat_prefix"
                ")"
            ).bindparams(cat_prefix=f"{category_path}%"),
        ))
    if name:
        q = q.where(Item.product_name.ilike(f"%{name}%"))
    if color:
        q = q.where(Item.color.ilike(f"%{color}%"))
    q = q.order_by(Item.product_name, Item.color).offset(skip).limit(limit)
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/count")
async def count_items(active_only: bool = Query(True), db: AsyncSession = Depends(get_db)):
    q = select(func.count(Item.id))
    if active_only:
        q = q.where(Item.is_active == True)
    result = await db.execute(q)
    return {"count": result.scalar()}


@router.get("/by-product/{product_id}", response_model=list[ItemOut])
async def get_items_by_product(
    product_id: str,
    active_only: bool = Query(True),
    db: AsyncSession = Depends(get_db),
):
    """Return all colour variants that share the same product_id."""
    q = select(Item).where(Item.product_id == product_id)
    if active_only:
        q = q.where(Item.is_active == True)
    q = q.order_by(Item.color)
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/{item_id}", response_model=ItemOut)
async def get_item(item_id: int, db: AsyncSession = Depends(get_db)):
    item = await db.get(Item, item_id)
    if not item:
        raise HTTPException(404, "Item not found")
    return item


@router.patch("/{item_id}", response_model=ItemOut)
async def update_item(item_id: int, payload: ItemUpdate, db: AsyncSession = Depends(get_db)):
    item = await db.get(Item, item_id)
    if not item:
        raise HTTPException(404, "Item not found")

    sizes_changed = False
    for field, value in payload.model_dump(exclude_none=True).items():
        if field == "sizes_available" and value != item.sizes_available:
            sizes_changed = True
        setattr(item, field, value)

    # Re-generate watermark if sizes changed
    if sizes_changed and item.image_original:
        wm_rel = watermarked_path(item.image_original)
        loop = asyncio.get_running_loop()
        try:
            await loop.run_in_executor(
                None,
                apply_watermark,
                abs_path(item.image_original),
                abs_path(wm_rel),
                item.product_name,
                item.category_path,
                item.sizes_available or [],
                item.rack_location or "",
            )
            item.image_watermarked = wm_rel
        except Exception as exc:
            logger.warning(
                "Could not re-watermark item %s (image may be corrupt — "
                "sizes saved anyway): %s", item_id, exc
            )

    await db.commit()
    await db.refresh(item)
    return item


@router.post("/{item_id}/regenerate-model")
async def regenerate_model_photo(
    item_id: int,
    background_tasks: BackgroundTasks,
    product_id: str = Query(""),
    db: AsyncSession = Depends(get_db),
):
    """
    Trigger AI model photo generation for an existing item.
    Pass ?product_id=XYZ to set the corner badge text.
    """
    from routers.upload import _regen_model_photo

    item = await db.get(Item, item_id)
    if not item:
        raise HTTPException(404, "Item not found")
    if not item.image_original:
        raise HTTPException(400, "Item has no original image")

    all_cats = ([item.category_path] if item.category_path else []) + (item.extra_category_paths or [])
    badge = product_id or str(item_id)

    background_tasks.add_task(
        _regen_model_photo,
        item.id,
        abs_path(item.image_original),
        abs_path(watermarked_path(item.image_original)),
        item.product_name,
        all_cats,
        badge,
    )
    return {"ok": True, "message": "Model photo generation started in background"}


@router.post("/bulk-delete")
async def bulk_delete_items(payload: BulkDeleteRequest, db: AsyncSession = Depends(get_db)):
    if not payload.ids:
        return {"ok": True, "deleted": 0}
    result = await db.execute(select(Item).where(Item.id.in_(payload.ids)))
    items_to_delete = result.scalars().all()
    count = 0
    for item in items_to_delete:
        delete_item_files(item.image_original, item.image_watermarked)
        await db.delete(item)
        count += 1
    await db.commit()
    return {"ok": True, "deleted": count}


@router.post("/model-photos-zip")
async def model_photos_zip(payload: ModelPhotosZipRequest, db: AsyncSession = Depends(get_db)):
    """Download model photos as a ZIP. Pass ids list or category_path."""
    if payload.ids is not None:
        result = await db.execute(select(Item).where(Item.id.in_(payload.ids)))
    elif payload.category_path:
        result = await db.execute(
            select(Item)
            .where(Item.category_path.like(f"{payload.category_path}%"))
            .where(Item.is_active == True)
        )
    else:
        raise HTTPException(400, "Provide ids or category_path")

    items = result.scalars().all()
    items_with_photos = [i for i in items if i.model_image_url]
    if not items_with_photos:
        raise HTTPException(404, "No model photos found for the given selection")

    zip_buffer = io.BytesIO()
    seen_names: set[str] = set()
    async with httpx.AsyncClient(timeout=30) as client:
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            for item in items_with_photos:
                try:
                    resp = await client.get(item.model_image_url)
                    if resp.status_code != 200:
                        continue
                    ext = item.model_image_url.rsplit(".", 1)[-1].split("?")[0][:4] if "." in item.model_image_url else "jpg"
                    base = f"{item.product_name}_{item.color or str(item.id)}".strip("_")
                    safe = "".join(c if c.isalnum() or c in " ._-" else "_" for c in base)
                    filename = f"{safe}.{ext}"
                    # Avoid duplicate filenames
                    if filename in seen_names:
                        filename = f"{safe}_{item.id}.{ext}"
                    seen_names.add(filename)
                    zf.writestr(filename, resp.content)
                except Exception as exc:
                    logger.warning("Failed to fetch model photo for item %s: %s", item.id, exc)

    zip_buffer.seek(0)
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=model-photos.zip"},
    )


@router.get("/{item_id}/model-photo-download")
async def download_model_photo(item_id: int, db: AsyncSession = Depends(get_db)):
    """Proxy download of a single item's AI model photo."""
    item = await db.get(Item, item_id)
    if not item:
        raise HTTPException(404, "Item not found")
    if not item.model_image_url:
        raise HTTPException(404, "This item has no model photo")

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(item.model_image_url)
        if resp.status_code != 200:
            raise HTTPException(502, "Failed to fetch model photo from storage")

    ext = item.model_image_url.rsplit(".", 1)[-1].split("?")[0][:4] if "." in item.model_image_url else "jpg"
    name = f"{item.product_name}{f'-{item.color}' if item.color else ''}-model"
    safe_name = "".join(c if c.isalnum() or c in " ._-" else "_" for c in name)
    content_type = resp.headers.get("content-type", "image/jpeg")
    return StreamingResponse(
        iter([resp.content]),
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{safe_name}.{ext}"'},
    )


@router.delete("/{item_id}")
async def delete_item(item_id: int, db: AsyncSession = Depends(get_db)):
    item = await db.get(Item, item_id)
    if not item:
        raise HTTPException(404, "Item not found")
    delete_item_files(item.image_original, item.image_watermarked)
    await db.delete(item)
    await db.commit()
    return {"ok": True}

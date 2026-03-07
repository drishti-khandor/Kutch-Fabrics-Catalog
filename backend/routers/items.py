from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, text
from database import get_db
from models import Item
from schemas import ItemOut, ItemUpdate
from services.watermark_service import apply_watermark
from services.storage_service import abs_path, watermarked_path, delete_item_files
import asyncio
import logging

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


@router.delete("/{item_id}")
async def delete_item(item_id: int, db: AsyncSession = Depends(get_db)):
    item = await db.get(Item, item_id)
    if not item:
        raise HTTPException(404, "Item not found")
    delete_item_files(item.image_original, item.image_watermarked)
    await db.delete(item)
    await db.commit()
    return {"ok": True}

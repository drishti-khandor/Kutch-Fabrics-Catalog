from fastapi import APIRouter, Depends, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from sqlalchemy.sql import text
from database import get_db
from models import Item
from schemas import ItemOut, TextSearchRequest, SearchResult
from services.gemini_service import embed_query, embed_image_for_search

router = APIRouter(prefix="/api/search", tags=["search"])


@router.post("/text", response_model=SearchResult)
async def text_search(payload: TextSearchRequest, db: AsyncSession = Depends(get_db)):
    q = select(Item).where(Item.is_active == True)

    if payload.category_path:
        q = q.where(Item.category_path.like(f"{payload.category_path}%"))

    terms = payload.query.strip().split()
    if terms:
        conditions = []
        for term in terms:
            like = f"%{term}%"
            conditions.append(Item.product_name.ilike(like))
            conditions.append(Item.color.ilike(like))
            conditions.append(Item.rack_location.ilike(like))
            conditions.append(Item.description.ilike(like))
            conditions.append(Item.category_path.ilike(like))
        q = q.where(or_(*conditions))

    q = q.order_by(Item.product_name, Item.color).limit(payload.limit)
    result = await db.execute(q)
    items = result.scalars().all()
    return SearchResult(items=list(items), total=len(items))


@router.post("/visual", response_model=SearchResult)
async def visual_search(
    file: UploadFile = File(...),
    limit: int = Form(20),
    db: AsyncSession = Depends(get_db),
):
    image_bytes = await file.read()
    mime = file.content_type or "image/jpeg"
    embedding = await embed_image_for_search(image_bytes, mime)

    sql = text("""
        SELECT id FROM items
        WHERE is_active = true AND image_embedding IS NOT NULL
        ORDER BY image_embedding <=> CAST(:embedding AS vector)
        LIMIT :limit
    """)
    result = await db.execute(sql, {"embedding": str(embedding), "limit": limit})
    ids = [row[0] for row in result.fetchall()]

    if not ids:
        return SearchResult(items=[], total=0)

    items_result = await db.execute(select(Item).where(Item.id.in_(ids)))
    items_map = {i.id: i for i in items_result.scalars().all()}
    ordered = [items_map[i] for i in ids if i in items_map]
    return SearchResult(items=ordered, total=len(ordered))

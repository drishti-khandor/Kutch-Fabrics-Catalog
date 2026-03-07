from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from database import get_db
from models import Category, Item
from schemas import CategoryCreate, CategoryOut

router = APIRouter(prefix="/api/categories", tags=["categories"])


def _build_tree(categories: list[Category]) -> list[CategoryOut]:
    by_id = {c.id: CategoryOut(id=c.id, name=c.name, parent_id=c.parent_id, path=c.path) for c in categories}
    roots = []
    for c in categories:
        if c.parent_id is None:
            roots.append(by_id[c.id])
        else:
            parent = by_id.get(c.parent_id)
            if parent:
                parent.children.append(by_id[c.id])
    return roots


@router.get("", response_model=list[CategoryOut])
async def list_categories(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Category).order_by(Category.path))
    cats = result.scalars().all()
    return _build_tree(list(cats))


@router.post("", response_model=CategoryOut)
async def create_category(payload: CategoryCreate, db: AsyncSession = Depends(get_db)):
    parent_path = ""
    if payload.parent_id:
        parent = await db.get(Category, payload.parent_id)
        if not parent:
            raise HTTPException(404, "Parent category not found")
        parent_path = parent.path + "/"

    path = parent_path + payload.name
    existing = await db.execute(select(Category).where(Category.path == path))
    if existing.scalar():
        raise HTTPException(409, "Category already exists")

    cat = Category(name=payload.name, parent_id=payload.parent_id, path=path)
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return CategoryOut(id=cat.id, name=cat.name, parent_id=cat.parent_id, path=cat.path)


@router.delete("/{cat_id}")
async def delete_category(cat_id: int, db: AsyncSession = Depends(get_db)):
    cat = await db.get(Category, cat_id)
    if not cat:
        raise HTTPException(404, "Not found")

    # Prevent deletion if items exist
    result = await db.execute(select(Item).where(Item.category_id == cat_id).limit(1))
    if result.scalar():
        raise HTTPException(400, "Cannot delete: category has items. Remove items first.")

    await db.execute(delete(Category).where(Category.path.like(cat.path + "%")))
    await db.commit()
    return {"ok": True}

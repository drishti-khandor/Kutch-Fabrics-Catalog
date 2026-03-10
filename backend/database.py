from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text
from config import get_settings

settings = get_settings()

engine = create_async_engine(settings.database_url, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


async def init_db():
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        from models import Category, Item, User  # noqa
        await conn.run_sync(Base.metadata.create_all)
        # Add extra_category_paths column to existing databases that pre-date this field
        await conn.execute(text(
            "ALTER TABLE items ADD COLUMN IF NOT EXISTS "
            "extra_category_paths TEXT[] DEFAULT '{}'"
        ))
        # Add model_image_url column for S3-hosted AI model photos
        await conn.execute(text(
            "ALTER TABLE items ADD COLUMN IF NOT EXISTS "
            "model_image_url TEXT DEFAULT ''"
        ))
        # Add product_id for grouping colour variants of the same product
        await conn.execute(text(
            "ALTER TABLE items ADD COLUMN IF NOT EXISTS "
            "product_id VARCHAR(100) DEFAULT ''"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_items_product_id ON items (product_id)"
        ))
    await _seed_categories()
    await _migrate_saree_categories()


async def _seed_categories():
    """Insert default category tree if empty."""
    async with AsyncSessionLocal() as session:
        from models import Category
        from sqlalchemy import select
        result = await session.execute(select(Category).limit(1))
        if result.scalar():
            return

        tree = {
            "Fabrics": ["Ajarak", "Bandhani", "Chanderi", "Cotton", "Georgette",
                        "Kota", "Linen", "Modal", "Net", "Rayon", "Silk", "Velvet"],
            "Garments": {
                "Kurtis": ["Short Kurti", "Long Kurti", "Anarkali"],
                "": ["Tops", "Bottoms", "Dresses", "Jumpsuits", "Saree Blouses"],
            },
            "Sarees": ["Ajrakh", "Banarasi", "Chiffon", "Cotton", "Crepe", "Designer",
                       "Georgette", "Modal", "Printed", "Silk", "Wedding"],
        }

        for parent_name, children in tree.items():
            parent = Category(name=parent_name, path=parent_name, parent_id=None)
            session.add(parent)
            await session.flush()

            if isinstance(children, list):
                for child_name in children:
                    child = Category(
                        name=child_name,
                        path=f"{parent_name}/{child_name}",
                        parent_id=parent.id,
                    )
                    session.add(child)
            elif isinstance(children, dict):
                for sub_name, sub_children in children.items():
                    if sub_name:
                        sub = Category(
                            name=sub_name,
                            path=f"{parent_name}/{sub_name}",
                            parent_id=parent.id,
                        )
                        session.add(sub)
                        await session.flush()
                        for leaf_name in sub_children:
                            leaf = Category(
                                name=leaf_name,
                                path=f"{parent_name}/{sub_name}/{leaf_name}",
                                parent_id=sub.id,
                            )
                            session.add(leaf)
                    else:
                        for leaf_name in sub_children:
                            leaf = Category(
                                name=leaf_name,
                                path=f"{parent_name}/{leaf_name}",
                                parent_id=parent.id,
                            )
                            session.add(leaf)

        await session.commit()


async def _migrate_saree_categories():
    """Add Ajrakh and Modal under Sarees if not already present."""
    async with AsyncSessionLocal() as session:
        from models import Category
        from sqlalchemy import select

        result = await session.execute(
            select(Category).where(Category.path == "Sarees")
        )
        sarees = result.scalar()
        if not sarees:
            return

        for name in ["Ajrakh", "Modal"]:
            path = f"Sarees/{name}"
            existing = await session.execute(
                select(Category).where(Category.path == path)
            )
            if not existing.scalar():
                session.add(Category(name=name, path=path, parent_id=sarees.id))

        await session.commit()

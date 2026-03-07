from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, ARRAY, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from pgvector.sqlalchemy import Vector
from database import Base


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    parent_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    path = Column(Text, nullable=False, unique=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    parent = relationship("Category", remote_side=[id], backref="children")
    items = relationship("Item", back_populates="category")


class Item(Base):
    __tablename__ = "items"

    id = Column(Integer, primary_key=True, index=True)
    product_name = Column(String(255), nullable=False, index=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    category_path = Column(Text, nullable=False, default="")
    color = Column(String(100), default="")
    sizes_available = Column(ARRAY(String), default=list)
    rack_location = Column(String(100), default="")
    description = Column(Text, default="")
    tags = Column(ARRAY(String), default=list)
    product_id = Column(String(100), default="", index=True)
    extra_category_paths = Column(ARRAY(Text), default=list)
    image_original = Column(Text, default="")
    image_watermarked = Column(Text, default="")
    model_image_url = Column(Text, default="")
    image_embedding = Column(Vector(768), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    category = relationship("Category", back_populates="items")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from pathlib import Path
import logging
import os

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)

from database import init_db
from config import get_settings
from routers import categories, items, search, upload

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="Smart Shop Catalog API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://frontend:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve local images
catalog_path = Path(settings.catalog_data_path)
catalog_path.mkdir(parents=True, exist_ok=True)
app.mount("/images", StaticFiles(directory=str(catalog_path)), name="images")

# Routers
app.include_router(categories.router)
app.include_router(items.router)
app.include_router(search.router)
app.include_router(upload.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}

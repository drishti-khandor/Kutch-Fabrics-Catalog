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
from routers import categories, items, search, upload, auth

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

_raw_origins = os.getenv("CORS_ORIGINS", "")
_cors_origins: list[str] = (
    [o.strip() for o in _raw_origins.split(",") if o.strip()]
    if _raw_origins
    else ["*"]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve local images
catalog_path = Path(settings.catalog_data_path)
catalog_path.mkdir(parents=True, exist_ok=True)
app.mount("/images", StaticFiles(directory=str(catalog_path)), name="images")

# Routers
app.include_router(auth.router)
app.include_router(categories.router)
app.include_router(items.router)
app.include_router(search.router)
app.include_router(upload.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}

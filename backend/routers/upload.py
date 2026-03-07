import os
import tempfile
import asyncio
import logging
import urllib.request
from typing import Optional

from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Item, Category
from schemas import ItemOut, AIAnalysisResult
from services import gemini_service as gemini
from services.watermark_service import apply_watermark, apply_id_watermark_to_bytes
from services.storage_service import save_original, watermarked_path, abs_path
from services.s3_service import upload_model_image

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/upload", tags=["upload"])


@router.post("/analyse")
async def analyse_image(file: UploadFile = File(...)):
    """
    Step 1: Send image to Gemini and get AI-suggested metadata.
    Frontend shows this for the admin to review/edit before saving.
    """
    image_bytes = await file.read()
    suffix = "." + (file.filename or "img.jpg").split(".")[-1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(image_bytes)
        tmp_path = tmp.name

    try:
        analysis = await gemini.analyse_image(tmp_path)
    except Exception as exc:
        logger.error("analyse_image failed: %s: %s", type(exc).__name__, exc)
        raise HTTPException(status_code=500, detail=f"Gemini analysis failed: {exc}")
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    return AIAnalysisResult(
        product_name=analysis.get("product_name", ""),
        color=analysis.get("color", ""),
        description=analysis.get("description", ""),
        tags=analysis.get("tags", []),
        suggested_category=analysis.get("suggested_category", ""),
    )


@router.post("/analyse-batch")
async def analyse_batch_images(files: list[UploadFile] = File(...)):
    """
    Send all uploaded images to Gemini in a single call.
    Returns a list of product groups — Gemini decides which images are
    colour variants of the same product.
    Each group: { indices, canonical_name, suggested_category,
                  description, tags, colors }
    """
    temp_paths: list[str] = []
    try:
        for file in files:
            image_bytes = await file.read()
            suffix = "." + (file.filename or "img.jpg").split(".")[-1]
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                tmp.write(image_bytes)
                temp_paths.append(tmp.name)

        result = await gemini.analyse_batch(temp_paths)
        return result

    except Exception as exc:
        logger.error("analyse_batch_images failed: %s: %s", type(exc).__name__, exc)
        raise HTTPException(status_code=500, detail=f"Batch analysis failed: {exc}")
    finally:
        for path in temp_paths:
            try:
                os.unlink(path)
            except OSError:
                pass


@router.post("/preview-model")
async def preview_model_photo(
    file: UploadFile = File(...),
    product_name: str = Form(""),
    category_paths: str = Form(""),   # comma-separated list of category paths
    custom_prompt: str = Form(""),    # if provided, overrides the built prompt
    product_id: str = Form(""),       # optional — stamped as a corner badge if provided
):
    """
    Generate a model photo via Gemini, upload it to S3, and return the public URL.
    The URL is displayed directly in the browser and passed back at save time.
    """
    image_bytes = await file.read()
    suffix = "." + (file.filename or "img.jpg").split(".")[-1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(image_bytes)
        tmp_path = tmp.name

    try:
        paths = [p.strip() for p in category_paths.split(",") if p.strip()]
        prompt = (
            custom_prompt.strip()
            if custom_prompt.strip()
            else gemini.build_model_prompt(product_name, paths)
        )
        result = await gemini.generate_model_image_with_prompt(tmp_path, prompt)
    except Exception as exc:
        logger.error("preview_model_photo generation failed: %s: %s", type(exc).__name__, exc)
        raise HTTPException(status_code=500, detail=f"Model generation failed: {exc}")
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    if not result:
        raise HTTPException(
            status_code=500,
            detail="Model image generation failed — Gemini returned no image. Please try again.",
        )

    model_bytes, mime_type = result
    logger.info(
        "preview-model: received %d bytes mime=%s magic=%s",
        len(model_bytes), mime_type,
        model_bytes[:4].hex() if model_bytes else "empty",
    )

    # Stamp product ID badge before upload (in-memory, no temp files)
    if product_id.strip():
        loop = asyncio.get_running_loop()
        model_bytes = await loop.run_in_executor(
            None, apply_id_watermark_to_bytes, model_bytes, mime_type, product_id.strip()
        )
        mime_type = "image/png"
        logger.info("Product ID badge applied (%s), watermarked size=%d bytes", product_id.strip(), len(model_bytes))

    try:
        url = await upload_model_image(model_bytes, mime_type)
    except Exception as exc:
        logger.error("S3 upload failed in preview_model_photo: %s", exc)
        raise HTTPException(status_code=500, detail=f"Failed to upload model image to S3: {exc}")

    return {
        "prompt": prompt,
        "model_image_url": url,
    }


async def _stamp_badge_on_url(url: str, product_id: str) -> str:
    """
    Fetch an existing model image (public URL), stamp the product-ID corner badge,
    re-upload to S3 and return the new public URL.
    Runs the blocking urllib + PIL work in a thread-pool executor.
    """
    loop = asyncio.get_running_loop()

    def _fetch_and_stamp() -> bytes:
        with urllib.request.urlopen(url, timeout=30) as resp:
            img_bytes = resp.read()
        return apply_id_watermark_to_bytes(img_bytes, "image/png", product_id)

    badged_bytes = await loop.run_in_executor(None, _fetch_and_stamp)
    return await upload_model_image(badged_bytes, "image/png")


@router.post("/item", response_model=ItemOut)
async def upload_item(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    product_name: str = Form(...),
    # Multi-category: comma-separated list of category IDs e.g. "3,7"
    # First ID is the primary category (used for watermark text & file path).
    category_ids: str = Form(""),
    color: str = Form(""),
    sizes_available: str = Form(""),        # comma-separated: "S,M,L,XL"
    rack_location: str = Form(""),
    description: str = Form(""),
    tags: str = Form(""),                   # comma-separated
    product_id: str = Form(""),
    model_image_url: str = Form(""),        # S3 URL of pre-generated model image
    # True when the model was generated before the product ID was entered;
    # the backend will fetch the image, stamp the badge, and re-upload.
    apply_badge_to_model: bool = Form(False),
    db: AsyncSession = Depends(get_db),
):
    image_bytes = await file.read()
    filename = file.filename or "upload.jpg"

    sizes    = [s.strip() for s in sizes_available.split(",") if s.strip()]
    tag_list = [t.strip() for t in tags.split(",") if t.strip()]

    # ── Resolve category IDs → paths ──────────────────────
    cat_id_list = [int(x) for x in category_ids.split(",") if x.strip().isdigit()]

    primary_category_id: Optional[int] = None
    primary_category_path: str = ""
    extra_paths: list[str] = []

    for idx, cid in enumerate(cat_id_list):
        cat = await db.get(Category, cid)
        if cat:
            if idx == 0:
                primary_category_id   = cat.id
                primary_category_path = cat.path
            else:
                extra_paths.append(cat.path)

    all_category_paths = (
        [primary_category_path] + extra_paths if primary_category_path else extra_paths
    )

    # ── Save original to disk ─────────────────────────────
    original_rel = save_original(image_bytes, filename, primary_category_path)
    original_abs = abs_path(original_rel)

    # ── Generate watermarked image (banner with product info) ─
    wm_rel = watermarked_path(original_rel)
    wm_abs = abs_path(wm_rel)

    loop = asyncio.get_running_loop()
    await loop.run_in_executor(
        None,
        apply_watermark,
        original_abs,
        wm_abs,
        product_name,
        primary_category_path,
        sizes,
        rack_location,
    )

    # ── Stamp product-ID badge onto existing model image if needed ─
    # This path is taken when the model was auto-generated before the user
    # entered a product ID; instead of regenerating, we just stamp the badge
    # onto the already-uploaded image.
    final_model_url = model_image_url.strip()
    if final_model_url and product_id.strip() and apply_badge_to_model:
        try:
            final_model_url = await _stamp_badge_on_url(final_model_url, product_id.strip())
            logger.info("Stamped product-ID badge (%s) onto existing model image → %s",
                        product_id.strip(), final_model_url)
        except Exception as exc:
            logger.warning("Could not stamp badge on model image (using original): %s", exc)

    # ── Build search embedding ────────────────────────────
    embed_text = (
        f"{product_name} {color} "
        f"{' '.join(all_category_paths)} "
        f"{description} {' '.join(tag_list)}"
    )
    embedding = await gemini.embed_text(embed_text)

    item = Item(
        product_id=product_id.strip(),
        product_name=product_name,
        category_id=primary_category_id,
        category_path=primary_category_path,
        extra_category_paths=extra_paths,
        color=color,
        sizes_available=sizes,
        rack_location=rack_location,
        description=description,
        tags=tag_list,
        image_original=original_rel,
        image_watermarked=wm_rel,
        model_image_url=final_model_url,
        image_embedding=embedding,
        is_active=True,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)

    # ── If no pre-generated model URL, generate in background ─
    if not final_model_url:
        badge = product_id or str(item.id)
        background_tasks.add_task(
            _regen_model_photo,
            item.id,
            original_abs,
            product_name,
            all_category_paths,
            badge,
        )

    return item


async def _regen_model_photo(
    item_id: int,
    source_abs: str,
    product_name: str,
    all_category_paths: list[str],
    product_id: str,
):
    """
    Background task: call Gemini to generate a model image, upload to S3,
    and persist the URL in the database.
    """
    from database import AsyncSessionLocal

    logger.info("Starting model photo generation for item %s (%s)", item_id, product_name)

    from PIL import Image as _PILImage
    try:
        with _PILImage.open(source_abs) as _img:
            _img.verify()
    except Exception as exc:
        logger.error("Source image unreadable for item %s (%s): %s", item_id, source_abs, exc)
        return

    result = await gemini.generate_model_image_with_prompt(
        source_abs,
        gemini.build_model_prompt(product_name, all_category_paths),
    )
    if not result:
        logger.error("Model image generation returned no bytes for item %s", item_id)
        return

    model_bytes, mime_type = result
    logger.info("Received %d bytes of model image for item %s", len(model_bytes), item_id)

    # Stamp product ID badge before upload
    if product_id:
        loop = asyncio.get_running_loop()
        model_bytes = await loop.run_in_executor(
            None, apply_id_watermark_to_bytes, model_bytes, mime_type, product_id
        )
        mime_type = "image/png"

    try:
        url = await upload_model_image(model_bytes, mime_type)
    except Exception as exc:
        logger.error("S3 upload failed for item %s: %s", item_id, exc)
        return

    async with AsyncSessionLocal() as session:
        item = await session.get(Item, item_id)
        if item:
            item.model_image_url = url
            await session.commit()
            logger.info("Model photo URL saved for item %s: %s", item_id, url)

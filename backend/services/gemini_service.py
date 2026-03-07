
import base64
import json
import logging
import re
from pathlib import Path
from google import genai
from google.genai import types
from config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()

_client: genai.Client | None = None


def get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=settings.gemini_api_key)
    return _client


# ── Analyse a raw product image ────────────────────────────
async def analyse_image(image_path: str) -> dict:
    """
    Send image to Gemini text model and extract structured product metadata.
    Returns: product_name, color, description, tags, suggested_category
    """
    client = get_client()
    image_bytes = Path(image_path).read_bytes()
    b64 = base64.b64encode(image_bytes).decode()
    ext = Path(image_path).suffix.lower().lstrip(".")
    mime = f"image/{'jpeg' if ext in ('jpg', 'jpeg') else ext}"

    prompt = """You are a garment and fabric cataloging expert.
Analyse this product image and return a JSON object with exactly these keys:
{
  "product_name": "short colour-neutral name describing the garment type and fabric/print — NEVER include colour words here (e.g. 'Printed Harem Pants', 'Rayon Short Kurti', 'Ajrakh Cotton Saree'). The colour belongs only in the 'color' field.",
  "color": "primary color(s) of the item (e.g. 'Blue and White', 'Yellow', 'Multi-colour')",
  "description": "2-3 sentence product description",
  "tags": ["tag1", "tag2", ...],
  "suggested_category": "one of: Fabrics, Garments/Kurtis/Short Kurti, Garments/Kurtis/Long Kurti, Garments/Kurtis/Anarkali, Garments/Tops, Garments/Bottoms, Garments/Dresses, Garments/Jumpsuits, Garments/Saree Blouses, Sarees/Banarasi, Sarees/Chiffon, Sarees/Cotton, Sarees/Crepe, Sarees/Designer, Sarees/Georgette, Sarees/Printed, Sarees/Silk, Sarees/Wedding, Fabrics/Ajarak, Fabrics/Bandhani, Fabrics/Chanderi, Fabrics/Cotton, Fabrics/Georgette, Fabrics/Kota, Fabrics/Linen, Fabrics/Modal, Fabrics/Net, Fabrics/Rayon, Fabrics/Silk, Fabrics/Velvet"
}
IMPORTANT: product_name must NEVER contain colour words. Colour goes only in the 'color' field.
Return ONLY the JSON, no markdown, no explanation."""

    try:
        response = client.models.generate_content(
            model=settings.gemini_text_model,
            contents=[
                types.Part.from_bytes(data=base64.b64decode(b64), mime_type=mime),
                prompt,
            ],
        )
    except Exception as exc:
        logger.error("analyse_image Gemini call failed (model=%s): %s: %s",
                     settings.gemini_text_model, type(exc).__name__, exc)
        raise

    raw = response.text.strip()
    # strip markdown code fences if present
    raw = re.sub(r"^```[a-z]*\n?", "", raw)
    raw = re.sub(r"\n?```$", "", raw)

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {
            "product_name": "Unknown Product",
            "color": "",
            "description": raw,
            "tags": [],
            "suggested_category": "Garments",
        }


# ── Batch-analyse multiple product images in one call ──────
async def analyse_batch(image_paths: list[str]) -> list[dict]:
    """
    Send all images to Gemini in a single call.
    Gemini sees them together, decides which are colour-variants of the same
    product, and returns a grouped analysis.

    Returns a list of group dicts:
    [
      {
        "indices": [0, 2],           # 0-based positions in image_paths
        "canonical_name": "Printed Harem Pants",
        "suggested_category": "Garments/Bottoms",
        "description": "...",
        "tags": ["harem pants", ...],
        "colors": ["Yellow", "Blue"]  # one per index, same order
      },
      ...
    ]
    Falls back to one group per image if parsing fails.
    """
    client = get_client()
    n = len(image_paths)

    # Build contents: label + image for each file, then the instruction prompt
    contents: list = []
    for i, path in enumerate(image_paths):
        img_bytes = Path(path).read_bytes()
        ext = Path(path).suffix.lower().lstrip(".")
        mime = f"image/{'jpeg' if ext in ('jpg', 'jpeg') else ext}"
        contents.append(f"Image {i}:")
        contents.append(types.Part.from_bytes(data=img_bytes, mime_type=mime))

    valid_cats = (
        "Fabrics, Garments/Kurtis/Short Kurti, Garments/Kurtis/Long Kurti, "
        "Garments/Kurtis/Anarkali, Garments/Tops, Garments/Bottoms, Garments/Dresses, "
        "Garments/Jumpsuits, Garments/Saree Blouses, Sarees/Banarasi, Sarees/Chiffon, "
        "Sarees/Cotton, Sarees/Crepe, Sarees/Designer, Sarees/Georgette, Sarees/Printed, "
        "Sarees/Silk, Sarees/Wedding, Fabrics/Ajarak, Fabrics/Bandhani, Fabrics/Chanderi, "
        "Fabrics/Cotton, Fabrics/Georgette, Fabrics/Kota, Fabrics/Linen, Fabrics/Modal, "
        "Fabrics/Net, Fabrics/Rayon, Fabrics/Silk, Fabrics/Velvet"
    )

    contents.append(f"""You are a garment and fabric cataloging expert.
I have sent you {n} product images, each labelled Image 0 through Image {n-1}.

Your job:
1. Look at all images together and decide which ones show the SAME product in DIFFERENT colours (same garment type, same design/cut, just a different colour-way). Group those together.
2. Images that are clearly different products must be in separate groups.
3. For each group produce a comprehensive catalog entry.

Return a JSON array. Each element is ONE product group:
[
  {{
    "indices": [list of 0-based image indices belonging to this group],
    "canonical_name": "colour-neutral product name — NEVER include colour words (e.g. 'Printed Harem Pants', 'Rayon Short Kurti')",
    "suggested_category": "pick exactly one from the valid list below",
    "description": "2-3 sentence product description",
    "tags": ["tag1", "tag2", ...],
    "colors": ["colour of image at indices[0]", "colour of image at indices[1]", ...]
  }}
]

Rules:
- Every image index (0 to {n-1}) must appear in exactly one group.
- The "colors" array must be the same length as "indices" and in the same order.
- canonical_name must NEVER contain colour words.
- Valid categories: {valid_cats}

Return ONLY the JSON array, no markdown, no extra text.""")

    try:
        response = client.models.generate_content(
            model=settings.gemini_text_model,
            contents=contents,
        )
    except Exception as exc:
        logger.error("analyse_batch Gemini call failed: %s: %s", type(exc).__name__, exc)
        raise

    raw = response.text.strip()
    raw = re.sub(r"^```[a-z]*\n?", "", raw)
    raw = re.sub(r"\n?```$", "", raw)

    try:
        groups = json.loads(raw)
        # Validate basic structure
        if not isinstance(groups, list):
            raise ValueError("Expected a list")
        # Ensure every index 0..n-1 appears
        seen = set()
        for g in groups:
            for idx in g.get("indices", []):
                seen.add(idx)
        missing = set(range(n)) - seen
        for m in missing:
            groups.append({
                "indices": [m],
                "canonical_name": f"Product {m + 1}",
                "suggested_category": "Garments",
                "description": "",
                "tags": [],
                "colors": [""],
            })
        return groups
    except Exception as exc:
        logger.error("analyse_batch JSON parse failed: %s — raw: %.200s", exc, raw)
        # Fallback: one group per image
        return [
            {
                "indices": [i],
                "canonical_name": f"Product {i + 1}",
                "suggested_category": "Garments",
                "description": "",
                "tags": [],
                "colors": [""],
            }
            for i in range(n)
        ]


# ── Generate text embedding ────────────────────────────────
async def embed_text(text: str) -> list[float]:
    """Generate a 768-dim embedding for similarity search."""
    client = get_client()
    response = client.models.embed_content(
        model="gemini-embedding-001",
        contents=text,
        config=types.EmbedContentConfig(
            task_type="RETRIEVAL_DOCUMENT",
            output_dimensionality=768,
        ),
    )
    return response.embeddings[0].values


async def embed_query(text: str) -> list[float]:
    client = get_client()
    response = client.models.embed_content(
        model="gemini-embedding-001",
        contents=text,
        config=types.EmbedContentConfig(
            task_type="RETRIEVAL_QUERY",
            output_dimensionality=768,
        ),
    )
    return response.embeddings[0].values


# ── Category-aware prompt builder ─────────────────────────
def build_model_prompt(product_name: str, categories: list[str]) -> str:
    """
    Build a detailed, category-aware generation prompt.
    Accepts all selected category paths so combined types
    (e.g. Garments/Bottoms + Fabrics/Ajrakh) produce a coherent prompt.
    """
    all_text = " ".join(categories + [product_name]).lower()

    # ── Detect material / fabric notes ───────────────────
    fabric_labels = []
    for keywords, label in [
        (["ajrakh", "ajarak"],         "Ajrakh block-printed"),
        (["bandhani"],                  "Bandhani tie-dye"),
        (["chanderi"],                  "Chanderi"),
        (["kota"],                      "Kota Doria"),
        (["banarasi"],                  "Banarasi"),
        (["chiffon"],                   "chiffon"),
        (["georgette"],                 "georgette"),
        (["crepe"],                     "crepe"),
        (["silk"],                      "silk"),
        (["velvet"],                    "velvet"),
        (["linen"],                     "linen"),
        (["modal"],                     "modal"),
        (["rayon"],                     "rayon"),
        (["net"],                       "net"),
        (["cotton"],                    "cotton"),
        (["printed", "print"],          "printed"),
        (["designer"],                  "designer"),
        (["wedding", "bridal"],         "bridal"),
    ]:
        if any(k in all_text for k in keywords):
            fabric_labels.append(label)

    craft_labels = []
    for keywords, label in [
        (["embroid"],                   "embroidered"),
        (["handmade", "hand made"],     "handmade"),
        (["block print", "blockprint"], "block-printed"),
        (["zari", "zardozi"],           "zari-work"),
        (["mirror work", "shisha"],     "mirror-work"),
        (["handloom", "hand loom"],     "handloom"),
        (["tie dye", "tie-dye"],        "tie-dye"),
    ]:
        if any(k in all_text for k in keywords):
            craft_labels.append(label)

    fabric_str  = " ".join(fabric_labels) + " " if fabric_labels else ""
    craft_str   = " ".join(craft_labels)  + " " if craft_labels else ""
    material    = (craft_str + fabric_str).strip()
    mat         = material + " " if material else ""   # safe prefix

    faithful = (
        "Reproduce the item's exact colors, textures, surface patterns, prints, and "
        "embellishments faithfully from the input image — do not alter the design in any way. "
        "The product must look exactly as it does in real life. "
    )
    bg = (
        "Background: a rich, atmospheric studio setting — deep warm charcoal or soft off-white "
        "seamless backdrop depending on the garment's mood. "
        "Dramatic yet flattering directional lighting: a soft key light illuminating the face "
        "and garment beautifully, a subtle fill light, and a gentle warm rim light separating "
        "the model from the background. "
        "Skin looks luminous, natural, and real. No harsh shadows on the garment. "
    )
    pose = (
        "The model is a strikingly beautiful Indian woman with expressive eyes, effortless "
        "confidence, and a captivating presence. "
        "Her pose is elegant, natural, and aspirational — the kind that makes the viewer "
        "instantly want to wear this outfit. "
        "Editorial fashion photography quality, as published in a leading Indian fashion "
        "magazine. Shot on a high-end camera, every detail sharp and desirable. "
    )

    # ── Detect garment types ──────────────────────────────
    is_saree    = "saree" in all_text or "sari" in all_text
    is_dupatta  = "dupatta" in all_text or "stole" in all_text or (
                  "scarf" in all_text and "saree" not in all_text)
    is_anarkali = "anarkali" in all_text
    is_lehenga  = "lehenga" in all_text
    is_kurti    = ("kurti" in all_text or "kurta" in all_text) and not is_anarkali
    is_blouse   = "blouse" in all_text
    is_top      = "top" in all_text and not is_saree and not is_kurti
    is_bottom   = ("bottom" in all_text or "palazzo" in all_text or "trouser" in all_text
                   or "pant" in all_text or "skirt" in all_text or "harem" in all_text
                   or "dhoti" in all_text or "legging" in all_text)
    is_dress    = ("dress" in all_text or "gown" in all_text) and "address" not in all_text
    is_jumpsuit = "jumpsuit" in all_text or "playsuit" in all_text

    # For combined categories, note when a fabric category is paired with a garment
    fabric_hero_note = (
        f" The {material} texture, print, and surface craftsmanship should be clearly "
        "visible as the hero detail of the image."
        if material else ""
    )

    # ── Saree ─────────────────────────────────────────────
    if is_saree:
        return (
            f"You are given a product image of a {mat}saree. "
            "Generate a professional Indian fashion catalog photograph of a beautiful Indian woman "
            "gracefully wearing this exact saree in a classic Nivi drape. "
            "Show the complete saree: body fabric, border, and pallu draped over the left shoulder. "
            "Natural full-body front-facing pose with a gentle side turn. "
            + bg + faithful + pose
        )

    # ── Dupatta / Stole ───────────────────────────────────
    if is_dupatta:
        return (
            f"You are given a product image of a {mat}dupatta/stole. "
            "Generate a professional Indian fashion catalog photograph of a beautiful Indian woman "
            "elegantly wearing this dupatta draped over both shoulders, "
            "full length cascading in front to display both ends, borders, embroidery, and tassels. "
            "Full body visible, graceful standing pose. "
            + bg + faithful + pose
        )

    # ── Anarkali ──────────────────────────────────────────
    if is_anarkali:
        return (
            f"You are given a product image of a {mat}Anarkali suit. "
            "Generate a professional Indian fashion catalog photograph of a beautiful Indian woman "
            "wearing this exact Anarkali. Show the complete flared silhouette collar to hem, "
            "arms slightly extended to display the flare. Full body front-facing. "
            + bg + faithful + pose
        )

    # ── Lehenga ───────────────────────────────────────────
    if is_lehenga:
        return (
            f"You are given a product image of a {mat}lehenga. "
            "Generate a professional Indian fashion catalog photograph of a beautiful Indian woman "
            "wearing this exact lehenga with coordinating blouse and dupatta, "
            "showing the full skirt flare, embroidery, and hem detail. Full body visible. "
            + bg + faithful + pose
        )

    # ── Kurti (short or long) ─────────────────────────────
    if is_kurti:
        length = "long " if "long" in all_text else "short " if "short" in all_text else ""
        return (
            f"You are given a product image of a {mat}{length}kurti/kurta. "
            "Generate a professional Indian fashion catalog photograph of a beautiful Indian woman "
            "wearing this exact kurti, showing the complete garment collar to hem. "
            "Natural confident standing pose, front-facing." + fabric_hero_note + " "
            + bg + faithful + pose
        )

    # ── Saree Blouse ──────────────────────────────────────
    if is_blouse:
        return (
            f"You are given a product image of a {mat}saree blouse. "
            "Generate a professional Indian fashion catalog photograph of a beautiful Indian woman "
            "wearing this blouse styled with a coordinating plain saree so the blouse is the hero. "
            "Both front and back detail clearly visible. "
            + bg + faithful + pose
        )

    # ── Bottom wear (palazzos, trousers, skirt) ───────────
    if is_bottom:
        garment_word = (
            "harem pants"      if "harem"   in all_text else
            "dhoti pants"      if "dhoti"   in all_text else
            "palazzo trousers" if "palazzo" in all_text else
            "skirt"            if "skirt"   in all_text else
            "trousers/pants"
        )
        return (
            f"You are given a product image of {mat}{garment_word}. "
            "Generate a professional fashion catalog photograph of a beautiful woman "
            "wearing this exact bottom wear, paired with a simple plain neutral top. "
            "Full body waist-to-feet visible, natural pose." + fabric_hero_note + " "
            + bg + faithful + pose
        )

    # ── Top ───────────────────────────────────────────────
    if is_top:
        return (
            f"You are given a product image of a {mat}top/shirt. "
            "Generate a professional fashion catalog photograph of a beautiful woman "
            "wearing this exact top, paired with simple neutral bottoms. "
            "Full upper body clearly visible, natural standing pose." + fabric_hero_note + " "
            + bg + faithful + pose
        )

    # ── Dress / Gown ──────────────────────────────────────
    if is_dress:
        return (
            f"You are given a product image of a {mat}dress/gown. "
            "Generate a professional fashion catalog photograph of a beautiful woman "
            "wearing this exact dress, full silhouette shoulder to hem visible, "
            "slight movement to show the fabric's flow. "
            + bg + faithful + pose
        )

    # ── Jumpsuit ──────────────────────────────────────────
    if is_jumpsuit:
        return (
            f"You are given a product image of a {mat}jumpsuit. "
            "Generate a professional fashion catalog photograph of a beautiful woman "
            "wearing this exact jumpsuit, full body head to toe. Natural confident pose. "
            + bg + faithful + pose
        )

    # ── Unstitched fabric (no garment type detected) ──────
    return (
        f"You are given a product image of a {mat}fabric/textile. "
        "Generate a professional fabric catalog photograph of a beautiful Indian woman "
        "elegantly holding and displaying this unstitched fabric, "
        "letting it drape and cascade naturally from her hands to show its full length, "
        "both sides, sheen, texture, and surface print. "
        "The fabric should fill most of the frame so pattern and quality are clearly visible." +
        fabric_hero_note + " "
        + bg + faithful + pose
    )


# ── Generate AI model image from a custom prompt ───────────
async def generate_model_image_with_prompt(
    image_path: str,
    prompt: str,
) -> tuple[bytes, str] | None:
    """
    Generate a styled model photo using the provided prompt.
    Returns (image_bytes, mime_type) or None if generation fails.
    The mime_type (e.g. 'image/png') is taken directly from Gemini's response.
    """
    client = get_client()
    image_bytes = Path(image_path).read_bytes()
    b64 = base64.b64encode(image_bytes).decode()
    ext = Path(image_path).suffix.lower().lstrip(".")
    mime = f"image/{'jpeg' if ext in ('jpg', 'jpeg') else ext}"

    try:
        from PIL import Image as _PILImage
        with _PILImage.open(image_path) as _img:
            _img.verify()
    except Exception as exc:
        logger.error("Input image is not a valid image file (%s): %s", image_path, exc)
        return None

    logger.info("Generating model image — model=%s prompt_snippet=%.120s",
                settings.gemini_image_model, prompt)

    image_part = types.Part.from_bytes(data=base64.b64decode(b64), mime_type=mime)

    for modalities in (["IMAGE"], ["TEXT", "IMAGE"]):
        try:
            response = client.models.generate_content(
                model=settings.gemini_image_model,
                contents=[image_part, prompt],
                config=types.GenerateContentConfig(
                    response_modalities=modalities,
                ),
            )
            for part in response.candidates[0].content.parts:
                if part.inline_data and part.inline_data.mime_type.startswith("image/"):
                    out_mime = part.inline_data.mime_type  # e.g. "image/png"
                    # inline_data.data is already raw bytes — the SDK decodes base64 internally.
                    # Do NOT call base64.b64decode() here; that would corrupt the data.
                    raw = part.inline_data.data
                    img_bytes = bytes(raw) if not isinstance(raw, bytes) else raw
                    logger.info(
                        "Model image generated successfully — modalities=%s mime=%s "
                        "size=%d bytes magic=%s",
                        modalities, out_mime, len(img_bytes),
                        img_bytes[:4].hex() if img_bytes else "empty",
                    )
                    return img_bytes, out_mime
            logger.warning("No image part in response (modalities=%s). Parts: %s",
                           modalities,
                           [getattr(p, 'text', '<binary>')[:80]
                            for p in response.candidates[0].content.parts])
        except Exception as exc:
            logger.error("generate_model_image_with_prompt failed (modalities=%s): %s: %s",
                         modalities, type(exc).__name__, exc)

    return None


# ── Generate AI model image ────────────────────────────────
async def generate_model_image(
    image_path: str,
    product_name: str,
    categories: list[str],
) -> bytes | None:
    """
    Use Gemini image model to generate a styled model photo from a raw product shot.
    Returns only the bytes (background-task callers don't need the MIME type).
    """
    prompt = build_model_prompt(product_name, categories)
    result = await generate_model_image_with_prompt(image_path, prompt)
    return result[0] if result else None


# ── Visual search: embed an uploaded query image ───────────
async def embed_image_for_search(image_bytes: bytes, mime_type: str = "image/jpeg") -> list[float]:
    """Analyse a query image with Gemini, then embed the description for vector search."""
    client = get_client()
    b64 = base64.b64encode(image_bytes).decode()

    prompt = """Describe this garment/fabric product in detail for search purposes.
Include: type of garment, fabric, color, pattern, style, occasion.
Return only a plain text description, no JSON."""

    response = client.models.generate_content(
        model=settings.gemini_text_model,
        contents=[
            types.Part.from_bytes(data=base64.b64decode(b64), mime_type=mime_type),
            prompt,
        ],
    )
    description = response.text.strip()
    return await embed_query(description)

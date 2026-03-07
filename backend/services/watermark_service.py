from io import BytesIO
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import textwrap


def apply_watermark(
    image_path: str,
    output_path: str,
    product_name: str,
    category_path: str,
    sizes: list[str],
    rack_location: str,
) -> str:
    """
    Burn metadata onto the image as a semi-transparent banner at the bottom.
    Returns output_path.
    """
    img = Image.open(image_path).convert("RGBA")
    w, h = img.size

    # Scale banner to ~22% of image height, min 80px
    banner_h = max(80, int(h * 0.22))
    overlay = Image.new("RGBA", (w, banner_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    # Gradient-like dark bar (top transparent → bottom opaque)
    for y in range(banner_h):
        alpha = int(210 * (y / banner_h))
        draw.line([(0, y), (w, y)], fill=(15, 15, 15, alpha))

    img.paste(overlay, (0, h - banner_h), overlay)
    draw_main = ImageDraw.Draw(img)

    # Font sizes relative to banner
    def load_font(size: int):
        for font_path in [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/System/Library/Fonts/Helvetica.ttc",
        ]:
            try:
                return ImageFont.truetype(font_path, size)
            except Exception:
                pass
        return ImageFont.load_default()

    pad = int(w * 0.03)
    y_pos = h - banner_h + int(banner_h * 0.08)
    line_gap = int(banner_h * 0.28)

    # Line 1 — Product name (large, white)
    name_font = load_font(max(14, int(banner_h * 0.28)))
    name_text = product_name.upper()
    draw_main.text((pad, y_pos), name_text, font=name_font, fill=(255, 255, 255, 255))
    y_pos += line_gap

    # Line 2 — Category (small, light gray)
    cat_font = load_font(max(10, int(banner_h * 0.18)))
    draw_main.text((pad, y_pos), category_path, font=cat_font, fill=(200, 200, 200, 220))
    y_pos += int(line_gap * 0.8)

    # Line 3 — Sizes + Rack (white/amber)
    size_font = load_font(max(10, int(banner_h * 0.18)))
    sizes_str = "  ".join(sizes) if sizes else "—"
    sizes_text = f"Sizes: {sizes_str}"
    draw_main.text((pad, y_pos), sizes_text, font=size_font, fill=(255, 220, 100, 255))

    if rack_location:
        rack_text = f"Rack {rack_location}"
        bbox = draw_main.textbbox((0, 0), rack_text, font=size_font)
        rack_w = bbox[2] - bbox[0]
        draw_main.text((w - rack_w - pad, y_pos), rack_text, font=size_font, fill=(180, 220, 255, 220))

    # Save as JPEG
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    img.convert("RGB").save(str(out), "JPEG", quality=92)
    return str(out)


def _load_font(size: int):
    for font_path in [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]:
        try:
            return ImageFont.truetype(font_path, size)
        except Exception:
            pass
    return ImageFont.load_default()


def _stamp_id(img: Image.Image, product_id: str) -> Image.Image:
    """Burn a small semi-transparent product-ID badge into bottom-right corner (in-place copy)."""
    img = img.convert("RGBA")
    w, h = img.size

    font_size = max(12, min(28, int(h * 0.022)))
    font = _load_font(font_size)

    text = str(product_id)
    draw = ImageDraw.Draw(img)
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]

    pad    = max(6, int(h * 0.012))
    bg_pad = max(4, int(h * 0.008))
    x = w - text_w - pad - bg_pad * 2
    y = h - text_h - pad - bg_pad * 2

    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ov_draw = ImageDraw.Draw(overlay)
    ov_draw.rounded_rectangle(
        [x - bg_pad, y - bg_pad, x + text_w + bg_pad, y + text_h + bg_pad],
        radius=max(3, bg_pad),
        fill=(0, 0, 0, 160),
    )
    img = Image.alpha_composite(img, overlay)
    ImageDraw.Draw(img).text((x, y), text, font=font, fill=(255, 255, 255, 230))
    return img


def apply_id_watermark(image_path: str, output_path: str, product_id: str) -> str:
    """
    File-based: burn the product ID badge onto a model image saved to disk.
    Returns output_path.
    """
    img = _stamp_id(Image.open(image_path), product_id)
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    img.convert("RGB").save(str(out), "JPEG", quality=92)
    return str(out)


def apply_id_watermark_to_bytes(data: bytes, mime_type: str, product_id: str) -> bytes:
    """
    In-memory: stamp the product ID badge onto raw image bytes and return the
    watermarked image as PNG bytes (no temp files, safe for S3 upload pipelines).
    """
    img = _stamp_id(Image.open(BytesIO(data)), product_id)
    buf = BytesIO()
    img.convert("RGB").save(buf, format="PNG", optimize=True)
    return buf.getvalue()

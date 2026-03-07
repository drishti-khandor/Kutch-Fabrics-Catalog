import asyncio
import logging
import uuid
from functools import lru_cache

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from config import get_settings

logger = logging.getLogger(__name__)


@lru_cache()
def _get_client():
    settings = get_settings()
    return boto3.client(
        "s3",
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
        region_name=settings.aws_region,
    )


def _upload_sync(data: bytes, key: str, content_type: str) -> str:
    settings = get_settings()
    client = _get_client()
    client.put_object(
        Bucket=settings.aws_s3_bucket,
        Key=key,
        Body=data,
        ContentType=content_type,
    )
    return f"{settings.aws_s3_base_url.rstrip('/')}/{key}"


async def upload_model_image(data: bytes, mime_type: str = "image/png") -> str:
    """
    Upload model image bytes to S3 and return the public URL.
    Runs the blocking boto3 call in a thread executor.
    """
    ext = mime_type.split("/")[-1]  # "png", "jpeg", etc.
    key = f"images/{uuid.uuid4().hex}.{ext}"
    logger.info(
        "Uploading to S3 — key=%s mime=%s size=%d bytes magic=%s",
        key, mime_type, len(data),
        data[:4].hex() if data else "empty",
    )
    loop = asyncio.get_running_loop()
    try:
        url = await loop.run_in_executor(None, _upload_sync, data, key, mime_type)
        logger.info("S3 upload successful: %s", url)
        return url
    except (BotoCoreError, ClientError) as exc:
        logger.error("S3 upload failed (key=%s): %s", key, exc)
        raise

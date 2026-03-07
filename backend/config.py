from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://catalog_user:catalog_pass@postgres:5432/catalog"
    gemini_api_key: str = ""
    gemini_image_model: str = "gemini-3-pro-image-preview"
    gemini_text_model: str = "gemini-3.1-pro-preview"
    catalog_data_path: str = "/catalog_data"

    # AWS S3
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_s3_bucket: str = ""
    aws_region: str = "eu-north-1"
    aws_s3_base_url: str = ""

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()

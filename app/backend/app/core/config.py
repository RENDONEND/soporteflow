from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg2://soporteflow:soporteflow@localhost:5432/soporteflow"
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    admin_email: str = "admin@soporteflow.local"
    admin_password: str = "admin"
    upload_dir: str = "data/uploads"
    max_upload_mb: int = 10
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "SoporteFlow <no-reply@soporteflow.local>"
    smtp_tls: bool = True
    app_base_url: str = "http://127.0.0.1:8000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def email_enabled(self) -> bool:
        return bool(self.smtp_host.strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str = os.getenv("DATABASE_URL", "postgresql://soporteflow:soporteflow@localhost:5432/soporteflow")
    jwt_secret: str = os.getenv("JWT_SECRET", "change-me")
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60*24

    class Config:
        env_file = ".env"

settings = Settings()

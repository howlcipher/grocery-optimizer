import os
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


def get_xdg_data_dir() -> Path:
    xdg = os.environ.get("XDG_DATA_HOME")
    if xdg:
        base = Path(xdg)
    else:
        base = Path.home() / ".local" / "share"
    data_dir = base / "grocery-optimizer"
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir


def get_default_database_url() -> str:
    # 1. Explicit DATABASE_URL in environment takes precedence
    if "DATABASE_URL" in os.environ and os.environ["DATABASE_URL"].strip():
        return os.environ["DATABASE_URL"].strip()

    # 2. Desktop or standalone mode defaults to SQLite in user's XDG data directory
    if os.environ.get("GROCERY_OPTIMIZER_DESKTOP") == "1" or os.environ.get("STANDALONE") == "1":
        db_file = get_xdg_data_dir() / "grocery_optimizer.db"
        return f"sqlite:///{db_file}"

    # 3. Default development URL
    return "postgresql+psycopg://howlcipher:grocery_dev@127.0.0.1:5432/grocery_optimizer"


class Settings(BaseSettings):
    database_url: str = get_default_database_url()
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]
    environment: str = "development"
    data_dir: str = str(get_xdg_data_dir())

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()

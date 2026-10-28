import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes import router
from app.config import settings
from app.persistence.init_db import ensure_database_initialized


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Auto-initialize database schema and staple products if needed
    ensure_database_initialized()
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="Grocery Optimizer API",
        description="Deterministic consumer grocery shopping optimization engine",
        version="0.6.0",
        lifespan=lifespan,
    )

    # Configure CORS for local development and frontend
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(router)

    # Check for bundled frontend static build (for standalone desktop release)
    dist_paths: list[Path] = []
    if hasattr(sys, "_MEIPASS"):
        dist_paths.append(Path(sys._MEIPASS) / "frontend_dist")
    dist_paths.extend([
        Path(__file__).resolve().parent.parent / "frontend_dist",
        Path(__file__).resolve().parent.parent.parent / "frontend" / "dist",
    ])
    for dp in dist_paths:
        if dp.exists() and (dp / "index.html").exists():
            app.mount("/", StaticFiles(directory=str(dp), html=True), name="frontend")
            break

    return app


app = create_app()

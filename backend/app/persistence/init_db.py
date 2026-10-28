"""Database auto-initialization helper for standalone and desktop installations."""

import logging

from app.persistence.database import Base, SessionLocal, engine
from app.persistence.models import ProductModel
from app.seed.seeder import seed_database

logger = logging.getLogger(__name__)


def ensure_database_initialized() -> None:
    """Ensure database schema is created and initial seed products exist if empty."""
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        prod_count = db.query(ProductModel).count()
        if prod_count == 0:
            logger.info("Initializing fresh database with standard household staples catalog...")
            seed_database(db)

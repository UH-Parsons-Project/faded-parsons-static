"""Utility functions for registration token management."""

from datetime import datetime, timedelta, timezone
import hashlib
import secrets
import string

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models import RegistrationToken


TOKEN_RETENTION_DAYS = 60


def generate_token(length: int = 15) -> str:
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def verify_token(token: str, token_hash: str) -> bool:
    return hashlib.sha256(token.encode("utf-8")).hexdigest() == token_hash


async def cleanup_old_registration_tokens(db: AsyncSession) -> int:
    """Delete registration tokens older than retention policy (2 months)."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=TOKEN_RETENTION_DAYS)
    result = await db.execute(
        delete(RegistrationToken).where(RegistrationToken.created_at < cutoff)
    )
    return int(result.rowcount or 0)

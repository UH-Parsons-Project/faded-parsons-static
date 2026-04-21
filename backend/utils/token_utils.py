"""Utility functions for registration token management."""

import hashlib
import secrets
import string


def generate_token(length: int = 15) -> str:
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def verify_token(token: str, token_hash: str) -> bool:
    return hashlib.sha256(token.encode("utf-8")).hexdigest() == token_hash

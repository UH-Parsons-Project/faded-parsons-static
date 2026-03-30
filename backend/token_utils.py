"""Utility functions for registration token management."""

import secrets
import string
import bcrypt


def generate_token(length: int = 15) -> str:
    """Generate a secure random registration token.

    Args:
        length: Length of the token to generate (default: 15 characters)
    
    Returns:
        A random alphanumeric token string
    """
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))


def hash_token(token: str) -> str:
    """Hash a token using bcrypt.
    
    Args:
        token: The token string to hash
    
    Returns:
        The bcrypt hash of the token
    """
    return bcrypt.hashpw(
        token.encode("utf-8"), bcrypt.gensalt()
    ).decode("utf-8")


def verify_token(token: str, token_hash: str) -> bool:
    """Verify a token against its hash.
    
    Args:
        token: The plain token to verify
        token_hash: The bcrypt hash to verify against
    
    Returns:
        True if the token matches the hash, False otherwise
    """
    try:
        return bcrypt.checkpw(
            token.encode("utf-8"), token_hash.encode("utf-8")
        )
    except (ValueError, TypeError):
        return False
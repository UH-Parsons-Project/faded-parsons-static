"""Compatibility shim for legacy imports.

Some tests and modules import the top-level `utils` package. The project
now exposes utilities under `backend.utils`. This module re-exports the
important symbols so old imports continue to work.
"""
from backend.utils import *  # noqa: F401,F403

__all__ = getattr(__import__("backend.utils", fromlist=["__all__"]), "__all__", [])

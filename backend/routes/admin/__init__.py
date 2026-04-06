from .admin_api import router  # re-export for easy imports

# Ensure admin submodule is imported so its route handlers are registered
from . import admin  # noqa: F401

__all__ = ["router"]

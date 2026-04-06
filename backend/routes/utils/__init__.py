from .utils import router  # re-export for easy imports

# Ensure module is imported so route handlers are registered
from . import utils  # noqa: F401

__all__ = ["router"]

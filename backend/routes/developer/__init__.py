from .developer_api import router  # re-export for easy imports

# Ensure `developer.py` is imported so module-level routes (e.g. `/dev/db`) are registered
from . import developer  # noqa: F401

__all__ = ["router"]

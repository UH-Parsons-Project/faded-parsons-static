from .developer_api import router
from fastapi import HTTPException, status
from fastapi.responses import HTMLResponse

import backend.config as config


@router.get("/dev/db", response_class=HTMLResponse)
async def db_operations_page():
    """Serve a page with database management buttons (requires DEVELOPMENT_MODE env variable)."""
    if not config.DEVELOPMENT_MODE:
        raise HTTPException(
            status_code=403,
            detail="Database management is only available in development mode",
        )

    html_content = """
    <h1>DB Management</h1>
    <button onclick="fetch('/api/reset-db', {method: 'POST'}).then(r => r.json()).then(d => alert(d.message || d.detail))">Reset DB</button>
    <button onclick="fetch('/api/seed-db', {method: 'POST'}).then(r => r.json()).then(d => alert(d.message || d.detail))">Seed DB</button>
    """

    return HTMLResponse(content=html_content)

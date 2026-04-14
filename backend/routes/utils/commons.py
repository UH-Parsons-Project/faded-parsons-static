from typing import Iterable

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi.responses import RedirectResponse
from typing import Callable, Any

from ...models import TaskSetItem


async def get_task_set_or_404(db: AsyncSession, task_set_model, task_set_id: int):
    stmt = select(task_set_model).where(task_set_model.id == task_set_id)
    result = await db.execute(stmt)
    task_set = result.scalar_one_or_none()
    if not task_set:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task list with id {task_set_id} not found",
        )
    return task_set


async def get_task_set_by_code_or_404(db: AsyncSession, task_set_model, unique_link_code: str):
    """Fetch a TaskSet by its unique link code or raise 404."""
    stmt = select(task_set_model).where(task_set_model.unique_link_code == unique_link_code)
    result = await db.execute(stmt)
    task_set = result.scalar_one_or_none()
    if not task_set:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Problem set with code {unique_link_code} not found",
        )
    return task_set


async def resolve_task_id_in_set_or_404(db: AsyncSession, task_set, task_position: int) -> int:
    """Resolve a 1-based task position inside a set to the underlying task id."""
    if task_position < 1:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found in this set",
        )

    stmt = (
        select(TaskSetItem.task_id)
        .where(TaskSetItem.task_set_id == task_set.id)
        .order_by(TaskSetItem.id.asc())
        .offset(task_position - 1)
        .limit(1)
    )
    result = await db.execute(stmt)
    task_id = result.scalar_one_or_none()

    if task_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found in this set",
        )

    return task_id


def build_taskset_response_list(rows: Iterable):
    """Build a list of TaskSetResponse-like dicts from query rows.

    The function returns plain dicts matching the Pydantic model fields so it
    can be returned directly from FastAPI endpoints regardless of response
    model usage.
    """
    result = []
    for ps, owner_username in rows:
        result.append({
            "id": ps.id,
            "title": ps.title,
            "unique_link_code": ps.unique_link_code,
            "teacher_id": ps.teacher_id,
            "owner_username": owner_username,
            "student_description": ps.student_description,
            "teacher_description": ps.teacher_description,
            "created_at": ps.created_at.isoformat(),
            "expires_at": ps.expires_at.isoformat() if ps.expires_at else None,
        })
    return result


def set_no_cache_headers(response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    return response


async def require_session_or_redirect(check_func: Callable[..., Any], redirect_url: str, *args, **kwargs):
    """Run `check_func(*args, **kwargs)` and return a RedirectResponse if it raises HTTPException.

    Returns None when the check passes; otherwise returns a RedirectResponse instance that
    the caller should return to the client.
    """
    try:
        await check_func(*args, **kwargs)
    except HTTPException:
        return RedirectResponse(url=redirect_url, status_code=status.HTTP_303_SEE_OTHER)
    return None


async def fetch_nonempty_ids(db: AsyncSession, stmt):
    """Execute a single-column select statement and return the id list or empty list.

    Callers can use `ids = await fetch_nonempty_ids(db, stmt)` and `if not ids: return []`.
    """
    ids = await get_ids_from_stmt(db, stmt)
    if not ids:
        return []
    return ids


def validate_registration_basic(username: str, password: str, password_confirm: str, email: str,
                                username_max: int = 50, email_max: int = 100,
                                min_username: int = 5, min_password: int = 8):
    if not username or not password or not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="username, password and email are required",
        )

    if password != password_confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Passwords do not match",
        )

    if len(username) > username_max or len(email) > email_max:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="username or email too long",
        )

    if len(username) < min_username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"username must have a minimum length of {min_username} characters",
        )

    if len(password) < min_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"password must have a minimum length of {min_password} characters",
        )


async def ensure_unique_user(db: AsyncSession, model, username: str, email: str):
    stmt = select(model).where((model.username == username) | (model.email == email))
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username or email already exists",
        )


async def get_ids_from_stmt(db: AsyncSession, stmt):
    """Execute a select that returns single-column rows and return list of values."""
    result = await db.execute(stmt)
    rows = result.all()
    ids = [row[0] for row in rows]
    return ids


async def run_dev_action(mode_flag: bool, coro, forbidden_detail: str, success_message: str):
    """Run a dev-only coroutine with mode check and standardized error handling.

    `coro` should be an awaitable (callable returning coroutine) or coroutine object.
    """
    if not mode_flag:
        raise HTTPException(status_code=403, detail=forbidden_detail)

    try:
        # Support both callables and coroutine objects
        if callable(coro):
            await coro()
        else:
            await coro
        return {"status": "success", "message": success_message}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to run action: {str(e)}") from e


async def run_with_task_ids_or_empty(db: AsyncSession, task_ids_stmt, handler):
    """Fetch task ids, return [] if none, otherwise call `await handler(task_ids)`.

    `handler` must be an async callable accepting a single argument `task_ids`.
    """
    task_ids = await get_ids_from_stmt(db, task_ids_stmt)
    if not task_ids:
        return []
    return await handler(task_ids)

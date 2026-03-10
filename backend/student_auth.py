"""
Student session management utilities.
"""

import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import Cookie, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .database import get_db
from .models import Student

STUDENT_SESSION_EXPIRE_HOURS = 8

async def create_student_session(
    task_list_id: int,
    nickname: str,
    db: AsyncSession
) -> Student:
    """
    Create a new student record for nickname-based entry.
    Returns the Student object persisted in the database.

    Args:
        task_list_id: ID of the task list the student is working on
        nickname: Student's chosen nickname
        db: Database session

    Returns:
        Student: The created student object
    """
    student = Student(
        task_list_id=task_list_id,
        username=nickname,
        email=f"guest-{secrets.token_hex(12)}@local.student",
        started_at=datetime.now(timezone.utc),
        last_activity_at=datetime.now(timezone.utc)
    )
    # Set a random password hash for nickname-based guest records.
    student.set_password(secrets.token_urlsafe(24))

    db.add(student)
    await db.commit()
    await db.refresh(student)

    return student


async def get_student_session(
    session_token: Optional[str],
    db: AsyncSession,
    check_expiry: bool = True,
    update_activity: bool = True
) -> Optional[Student]:
    """
    Retrieve a student from cookie token.
    Returns None if session not found or expired.

    Args:
        session_token: The student id token from the cookie
        db: Database session
        check_expiry: Whether to validate session hasn't expired (default: True)
        update_activity: Whether to update last_activity_at timestamp (default: True)

    Returns:
        Student or None: The student if valid, None otherwise
    """
    if not session_token:
        return None

    try:
        student_id = int(session_token)
    except ValueError:
        return None

    result = await db.execute(
        select(Student).where(Student.id == student_id)
    )
    session = result.scalar_one_or_none()

    if not session:
        return None

    # Check if session has expired based on last activity
    if check_expiry:
        expiry_threshold = datetime.now(timezone.utc) - timedelta(hours=STUDENT_SESSION_EXPIRE_HOURS)
        # Handle both timezone-aware and naive datetimes (SQLite may return naive)
        last_activity = session.last_activity_at
        if last_activity.tzinfo is None:
            last_activity = last_activity.replace(tzinfo=timezone.utc)
        if last_activity < expiry_threshold:
            # Session expired
            return None

    # Update last activity timestamp (only if requested)
    if update_activity:
        session.last_activity_at = datetime.now(timezone.utc)
        await db.commit()

    return session


def set_session_cookie(
    response: Response,
    student_id: int,
    max_age_hours: Optional[int] = None
) -> None:
    """
    Set a persistent session cookie for the student.
    Cookie persists across browser restarts until it expires.

    Args:
        response: FastAPI Response object
        student_id: Primary key of the student
        max_age_hours: Cookie lifetime in hours (default: from STUDENT_SESSION_EXPIRE_HOURS)
    """
    if max_age_hours is None:
        max_age_hours = STUDENT_SESSION_EXPIRE_HOURS

    max_age_seconds = max_age_hours * 3600

    response.set_cookie(
        key="student_session",
        value=str(student_id),
        path="/",           # Cookie available for entire site
        httponly=True,      # Prevents JavaScript access (XSS protection)
        secure=False,       # Set to True in production with HTTPS
        samesite="lax",     # CSRF protection
        max_age=max_age_seconds  # Cookie persists for this duration
    )


async def get_current_student_session(
    student_session: Optional[str] = Cookie(None, alias="student_session"),
    db: AsyncSession = Depends(get_db)
) -> Optional[Student]:
    """
    Dependency to get the current student session if it exists.
    Returns None if no valid session found (does not raise exception).
    Updates last_activity_at timestamp.

    Usage: session = Depends(get_current_student_session)
    """
    return await get_student_session(student_session, db, update_activity=True)


async def get_current_student_session_no_update(
    student_session: Optional[str] = Cookie(None, alias="student_session"),
    db: AsyncSession = Depends(get_db)
) -> Optional[Student]:
    """
    Dependency to get the current student session if it exists.
    Returns None if no valid session found (does not raise exception).
    Does NOT update last_activity_at (lightweight check for redirects).

    Usage: session = Depends(get_current_student_session_no_update)
    """
    return await get_student_session(student_session, db, update_activity=False)


async def require_student_session(
    student_session: Optional[str] = Cookie(None, alias="student_session"),
    db: AsyncSession = Depends(get_db)
) -> Student:
    """
    Dependency to require a valid student session.
    Raises HTTPException if session is invalid or not found.

    Usage: session = Depends(require_student_session)
    """
    session = await get_student_session(student_session, db)

    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Valid student session required. Please enter your nickname again."
        )

    return session

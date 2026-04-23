from typing import Annotated
from datetime import timedelta

# Third-party
from fastapi import APIRouter, Depends, Response, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

# Local
from ...models import Teacher, RegistrationToken
from backend.utils import hash_token
from ...database import get_db
from ...auth import authenticate_user, ACCESS_TOKEN_EXPIRE_MINUTES, create_access_token, CurrentUser
from ...pydantic import Token, UserInfo
from ..utils.commons import validate_registration_basic, ensure_unique_user
from ...rate_limit import limiter, check_brute_force, record_failed_attempt, clear_failed_attempts

router = APIRouter()


@router.post("/api/login/access-token", response_model=Token)
@limiter.limit("20/minute")
async def login_access_token(
    request: Request,
    response: Response,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: AsyncSession = Depends(get_db),
):
    identifier = form_data.username.strip().lower()

    remaining = check_brute_force(identifier)
    if remaining is not None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Account temporarily locked. Try again in {int(remaining // 60) + 1} minute(s).",
        )

    user = await authenticate_user(form_data.username, form_data.password, db)

    if not user:
        record_failed_attempt(identifier)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect username, email, or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Inactive user"
        )

    clear_failed_attempts(identifier)

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )

    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
        samesite="lax",
        secure=False,  # Set to True in production with HTTPS
    )

    return Token(access_token=access_token, token_type="bearer")


@router.get("/api/me", response_model=UserInfo)
async def get_current_user_info(current_user: CurrentUser):
    role = "Admin" if current_user.is_admin_teacher else "Teacher"
    return UserInfo(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        is_admin_teacher=current_user.is_admin_teacher,
        role=role,
    )


@router.post("/api/logout")
async def logout(response: Response):
    response.delete_cookie(key="access_token", path="/")
    return {"message": "Successfully logged out"}


@router.post("/api/teacher_register")
async def api_teacher_register(request: Request, db: AsyncSession = Depends(get_db)):
    """Register a new teacher with username, password and email."""
    try:
        payload = await request.json()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON payload",
        ) from exc

    username = str(payload.get("username", "")).strip()
    password = payload.get("password", "")
    password_confirm = payload.get("password_confirm", "")
    email = str(payload.get("email", "")).strip()
    registration_token = str(payload.get("registration_token", "")).strip()

    # Validate registration token from database
    if not registration_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registration token is required",
        )

    # Find matching token in database by hash (O(1) lookup)
    token_hash = hash_token(registration_token)
    stmt = select(RegistrationToken).where(RegistrationToken.token_hash == token_hash)
    result = await db.execute(stmt)
    valid_token = result.scalar_one_or_none()

    if not valid_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid registration token",
        )

    if valid_token.is_expired():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registration token has expired",
        )

    # Basic validation (lengths, presence, password match)
    validate_registration_basic(username, password, password_confirm, email,
                                username_max=50, email_max=100)

    # Ensure uniqueness in DB
    await ensure_unique_user(db, Teacher, username, email)

    teacher = Teacher(username=username, email=email)
    teacher.set_password(password)

    db.add(teacher)
    await db.commit()
    await db.refresh(teacher)

    return {"status": "success", "id": teacher.id}

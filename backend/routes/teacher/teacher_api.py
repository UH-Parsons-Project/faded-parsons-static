from typing import Annotated
from datetime import timedelta
from fastapi import APIRouter, Depends, Response, HTTPException, status, Request
from sqlalchemy import select

from ...models import Teacher, RegistrationToken
from utils import verify_token
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import get_db
from ...auth import authenticate_user, ACCESS_TOKEN_EXPIRE_MINUTES, create_access_token, CurrentUser
from ...pydantic import Token, UserInfo

router = APIRouter()


@router.post("/api/login/access-token", response_model=Token)
async def login_access_token(
    response: Response,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: AsyncSession = Depends(get_db),
):
    user = await authenticate_user(form_data.username, form_data.password, db)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect username or password",
        )
    elif not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Inactive user"
        )

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
    role = "Admin" if current_user.has_data_access else "Teacher"
    return UserInfo(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        has_data_access=current_user.has_data_access,
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

    # Find matching token in database
    stmt = select(RegistrationToken)
    result = await db.execute(stmt)
    all_tokens = result.scalars().all()

    valid_token = None
    for token_obj in all_tokens:
        if verify_token(registration_token, token_obj.token_hash):
            valid_token = token_obj
            break

    if not valid_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid registration token",
        )

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

    # Basic length checks consistent with model limits
    if len(username) > 50 or len(email) > 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="username or email too long",
        )

    if len(username) < 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="username must have a minimum length of 5 characters",
        )

    if len(password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="password must have a minimum length of 8 characters",
        )

    # Check uniqueness
    stmt = select(Teacher).where((Teacher.username == username) | (Teacher.email == email))
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username or email already exists",
        )

    teacher = Teacher(username=username, email=email)
    teacher.set_password(password)

    db.add(teacher)
    await db.commit()
    await db.refresh(teacher)

    return {"status": "success", "id": teacher.id}

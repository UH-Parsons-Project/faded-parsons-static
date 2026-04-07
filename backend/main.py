"""
FastAPI backend for Faded Parsons Problems.
Provides endpoints for each page.
"""

import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated
import re
import json
from dotenv import load_dotenv

# Load environment variables from .env file
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(env_path)

from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from .pydantic import (
    Token,
    UserInfo,
    TaskResponse,
    ProblemSetResponse,
    ProblemSetTaskResponse,
    NicknameRequest,
    StudentLoginRequest,
    StudentInTaskListResponse,
    StudentTaskAttemptResponse,
    StudentTaskStatisticsResponse,
    SubmitTestResultRequest,
    CreateProblemRequest,
    CreateTaskListRequest,
    TaskListResponse,
    TaskListViewerRequest,
    TaskListViewerResponse,
)
from sqlalchemy import Integer, delete, or_, select, func
from sqlalchemy.ext.asyncio import AsyncSession
from .auth import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    CurrentUser,
    authenticate_user,
    create_access_token,
    get_current_user,
)
from .database import get_db, init_db
from .models import Parsons, Student, StudentTaskListEnrollment, TaskAttempt, TaskList, TaskListItem, TaskListViewer, Teacher, RegistrationToken, ModelAnswer
from . import reset_db as reset_module
from . import seed as seed_module
from .student_auth import (
    authenticate_student,
    create_student_session,
    set_session_cookie,
    get_current_student_session,
    get_current_student_session_no_update,
)
from utils import verify_token
from utils import (
    _clean_mistake_code,
    _mistake_code_fingerprint,
    generate_slug,
    has_user_added_own_code,
)

from .routes.student.student import router as student_router
from .routes.student.student_api import router as student_api_router
from .routes.admin.admin_api import router as admin_router
from .routes.developer.developer_api import router as developer_router
from .routes.utils import router as utils_router
from .routes.teacher.teacher import router as teacher_router
from .routes.teacher.teacher_api import router as teacher_api_router
from .routes.task.task import router as task_router
from .routes.task.task_api import router as task_api_router
from .routes.statistic.statistic import router as statistic_router
from .routes.statistic.statistic_api import router as statistic_api_router


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Initialize database and seed data on startup."""
    await init_db()
    await seed_module.seed_db()
    yield


app = FastAPI(title="Faded Parsons Problems", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Change to specific origins in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent.parent

async def _get_model_answer_for_task(task: Parsons, db: AsyncSession) -> str | None:
    """Return teacher-facing model answer from database for this exercise."""
    result = await db.execute(
        select(ModelAnswer.answer_code).where(ModelAnswer.parsons_id == task.id)
    )
    return result.scalar_one_or_none()
# Helper utilities moved to utils package

async def has_task_list_view_access(
    task_list: TaskList,
    current_user: Teacher,
    db: AsyncSession
) -> bool:
    if current_user.has_data_access or task_list.teacher_id == current_user.id:
        return True

    result = await db.execute(
        select(TaskListViewer).where(
            TaskListViewer.task_list_id == task_list.id,
            TaskListViewer.teacher_id == current_user.id,
        )
    )
    return result.scalar_one_or_none() is not None


async def require_task_list_view_access(
    task_list: TaskList,
    current_user: Teacher,
    db: AsyncSession
) -> None:
    if not await has_task_list_view_access(task_list, current_user, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to view this task list"
        )


# Mount static directories (only if they exist)
js_dir = BASE_DIR / "js"
if js_dir.exists():
    app.mount("/js", StaticFiles(directory=js_dir), name="js")

js_parsons_dir = BASE_DIR / "js-parsons"
if js_parsons_dir.exists():
    app.mount(
        "/js-parsons", StaticFiles(directory=js_parsons_dir), name="js-parsons"
    )

dist_dir = BASE_DIR / "dist"
if dist_dir.exists():
    app.mount("/dist", StaticFiles(directory=dist_dir), name="dist")

data_dir = BASE_DIR / "data"
if data_dir.exists():
    app.mount("/data", StaticFiles(directory=data_dir), name="data")

documentation_dir = BASE_DIR / "documentation"
if documentation_dir.exists():
    app.mount("/documentation", StaticFiles(directory=documentation_dir), name="documentation")

# Student routes moved to dedicated module
app.include_router(student_router)

# Admin routes moved to dedicated module
app.include_router(admin_router)
app.include_router(student_api_router)
app.include_router(developer_router)
app.include_router(utils_router)
app.include_router(teacher_api_router)
app.include_router(teacher_router)
app.include_router(task_router)
app.include_router(task_api_router)
app.include_router(statistic_router)
app.include_router(statistic_api_router)
from .routes.test.test_api import router as test_router
app.include_router(test_router)



# Feature flags (moved to backend/config.py)
from . import config


# Index route moved to `backend/routes/teacher/teacher.py`


# `task` and `all-tasks` routes moved to `backend/routes/task/task.py`

# Statistic pages moved to `backend/routes/statistic/statistic.py`

# `teacher-register` and `instructions` routes moved to `backend/routes/teacher/teacher.py`

# Authentication endpoints
# Auth endpoints moved to `backend/routes/teacher/teacher_api.py`


# `logout` moved to `backend/routes/teacher/teacher_api.py`


# Task API endpoints moved to `backend/routes/task/task_api.py`

# `api_teacher_register` moved to `backend/routes/teacher/teacher_api.py`


# Taskset endpoints moved to `backend/routes/task/task_api.py`

#### Who can view problem sets ####
#### Who can view problem sets ####

# Viewer-management endpoints have been moved to `backend/routes/task/task_api.py`.


# `get_problemset_students` moved to `backend/routes/task/task_api.py`


# Student attempts endpoints moved to `backend/routes/statistic/statistic_api.py`


# Student task statistics endpoints moved to `backend/routes/statistic/statistic_api.py`


# Task statistics endpoint moved to `backend/routes/statistic/statistic_api.py`

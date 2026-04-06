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
from .routes.test.test_api import router as test_router
app.include_router(test_router)



# Feature flags (moved to backend/config.py)
from . import config


@app.get("/", response_class=HTMLResponse)
async def index():
    """Serve the main index page."""
    index_path = BASE_DIR / "templates" / "index.html"
    return FileResponse(index_path)


@app.get("/task", response_class=HTMLResponse)
async def problem_page():
    problem_path = BASE_DIR / "templates" / "task.html"
    return FileResponse(problem_path)


@app.get("/all-tasks")
async def exercise_list(request: Request, db: AsyncSession = Depends(get_db)):
    try:
        await get_current_user(request, db)
    except HTTPException:
        return RedirectResponse(
            url="/", status_code=status.HTTP_303_SEE_OTHER
        )

    all_tasks_path = BASE_DIR / "templates" / "all_tasks.html"
    response = FileResponse(all_tasks_path)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    return response


@app.get("/task-statistics", response_class=HTMLResponse)
async def task_statistics_view(request: Request, db: AsyncSession = Depends(get_db)):
    try:
        await get_current_user(request, db)
    except HTTPException:
        return RedirectResponse(
            url="/", status_code=status.HTTP_303_SEE_OTHER
        )

    statistics_path = BASE_DIR / "templates" / "task_statistics.html"
    response = FileResponse(statistics_path)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    return response

@app.get("/teacher-dashboard", response_class=HTMLResponse)
async def teacher_selector(request: Request, db: AsyncSession = Depends(get_db)):
    try:
        await get_current_user(request, db)
    except HTTPException:
        return RedirectResponse(
            url="/", status_code=status.HTTP_303_SEE_OTHER
        )

    teacher_dashboard_path = BASE_DIR / "templates" / "teacher_dashboard.html"
    response = FileResponse(teacher_dashboard_path)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    return response

@app.get("/create_task_list", response_class=HTMLResponse)
async def create_task_list_page(request: Request, db: AsyncSession = Depends(get_db)):
    try:
        await get_current_user(request, db)
    except HTTPException:
        return RedirectResponse(
            url="/", status_code=status.HTTP_303_SEE_OTHER
        )

    create_path = BASE_DIR / "templates" / "create_task_list.html"
    response = FileResponse(create_path)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    return response


@app.get("/create_task", response_class=HTMLResponse)
@app.get("/create_task.html", response_class=HTMLResponse)
async def create_task_page(request: Request, db: AsyncSession = Depends(get_db)):
    try:
        await get_current_user(request, db)
    except HTTPException:
        return RedirectResponse(
            url="/", status_code=status.HTTP_303_SEE_OTHER
        )

    create_path = BASE_DIR / "templates" / "create_task.html"
    response = FileResponse(create_path)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    return response


@app.get("/create_task_problem", response_class=HTMLResponse)
@app.get("/create_task_problem.html", response_class=HTMLResponse)
async def create_task_problem_page(request: Request, db: AsyncSession = Depends(get_db)):
    try:
        await get_current_user(request, db)
    except HTTPException:
        return RedirectResponse(
            url="/", status_code=status.HTTP_303_SEE_OTHER
        )

    create_path = BASE_DIR / "templates" / "create_task_problem.html"
    response = FileResponse(create_path)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    return response

@app.get("/task_list_statistics", response_class=HTMLResponse)
async def task_list_statistics(request: Request, db: AsyncSession = Depends(get_db)):
    try:
        await get_current_user(request, db)
    except HTTPException:
        return RedirectResponse(
            url="/", status_code=status.HTTP_303_SEE_OTHER
        )

    stats_path = BASE_DIR / "templates" / "task_list_statistics.html"
    response = FileResponse(stats_path)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    return response

@app.get("/student_attempts", response_class=HTMLResponse)
async def student_attempts_page(request: Request, db: AsyncSession = Depends(get_db)):
    try:
        await get_current_user(request, db)
    except HTTPException:
        return RedirectResponse(
            url="/", status_code=status.HTTP_303_SEE_OTHER
        )

    attempts_path = BASE_DIR / "templates" / "student_attempts.html"
    response = FileResponse(attempts_path)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    return response

@app.get("/student_task_statistics", response_class=HTMLResponse)
async def student_task_statistics_page(request: Request, db: AsyncSession = Depends(get_db)):
    try:
        await get_current_user(request, db)
    except HTTPException:
        return RedirectResponse(
            url="/", status_code=status.HTTP_303_SEE_OTHER
        )

    stats_path = BASE_DIR / "templates" / "student_task_statistics.html"
    response = FileResponse(stats_path)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    return response

@app.get("/register", response_class=HTMLResponse)
async def register_page():
    """Serve a simple registration page."""
    register_path = BASE_DIR / "templates" / "register.html"
    return FileResponse(register_path)

@app.get("/instructions", response_class=HTMLResponse)
async def teacher_instructions_page():
    """Serve a simple teacher instructions page."""
    instructions_path = BASE_DIR / "templates" / "instructions.html"
    return FileResponse(instructions_path)

# Authentication endpoints
@app.post("/api/login/access-token", response_model=Token)
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


@app.get("/api/me", response_model=UserInfo)
async def get_current_user_info(current_user: CurrentUser):
    role = "Admin" if current_user.has_data_access else "Teacher"
    return UserInfo(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        has_data_access=current_user.has_data_access,
        role=role,
    )


@app.post("/api/logout")
async def logout(response: Response):
    response.delete_cookie(key="access_token", path="/")
    return {"message": "Successfully logged out"}


@app.get("/api/tasks/{task_id}", response_model=TaskResponse)
async def get_task(task_id: int, db: AsyncSession = Depends(get_db)):
    stmt = select(Parsons).where(Parsons.id == task_id)
    result = await db.execute(stmt)
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task with id {task_id} not found",
        )

    return TaskResponse(
        id=task.id,
        title=task.title,
        task_instructions=task.task_instructions,
        description=task.description,
        task_type=task.task_type,
        code_blocks=task.code_blocks,
        correct_solution=task.correct_solution,
        is_public=task.is_public,
        created_at=task.created_at.isoformat(),
    )


@app.get("/api/tasks")
async def list_tasks(db: AsyncSession = Depends(get_db)):

    # `json` imported at module top

    result = await db.execute(select(Parsons).where(Parsons.is_public))
    tasks = result.scalars().all()

    task_list = []
    for task in tasks:
        instructions_text = ""
        try:
            instructions_data = json.loads(task.task_instructions)
            if isinstance(instructions_data, dict):
                instructions_text = instructions_data.get("task_instructions", "")
            else:
                instructions_text = str(instructions_data or "")
        except (json.JSONDecodeError, AttributeError):
            instructions_text = ""

        description_text = ""
        if isinstance(task.description, str):
            try:
                description_data = json.loads(task.description)
                if isinstance(description_data, dict):
                    description_text = description_data.get("description", task.description)
                else:
                    description_text = str(description_data or "")
            except (json.JSONDecodeError, TypeError):
                description_text = task.description

        task_list.append(
            {
                "id": task.id,
                "title": task.title,
                "task_instructions": instructions_text,
                "description": description_text,
                "task_type": task.task_type,
                "created_at": task.created_at.isoformat(),
            }
        )

    return task_list


@app.post("/api/problems")
async def create_problem(
    request: CreateProblemRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db)
):
    task_title = request.taskTitle.strip()
    solution_code = request.solutionCode.replace("\r\n", "\n").replace("\r", "\n").strip()
    description = request.description.strip()
    start_description = request.startDescription.strip()
    tests = request.tests.strip()

    if not task_title or not solution_code or not description or not start_description or not tests:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="taskTitle, description, startDescription, tests and solutionCode are required",
        )

    lines = [line for line in solution_code.split("\n") if line.strip()]
    if not lines:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="solutionCode must contain at least one non-empty line",
        )

    first_code_line = lines[0].strip()
    if not (first_code_line.startswith("def ") or first_code_line.startswith("class ")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The first non-empty solution line must start with def or class",
        )

    header_match = re.match(r"^(def|class)\s+([A-Za-z_][A-Za-z0-9_]*)", first_code_line)
    function_name = header_match.group(2) if header_match else "custom_task"
    final_title = task_title

    existing_task_stmt = select(Parsons).where(Parsons.title == final_title)
    existing_task_result = await db.execute(existing_task_stmt)
    if existing_task_result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Exercise called '{final_title}' already exists. Choose a different task name.",
        )

    blocks = []
    for line_index, line in enumerate(lines, start=1):
        indent_count = len(line) - len(line.lstrip())
        blocks.append(
            {
                "id": f"block_{line_index}",
                "code": line.strip(),
                "indent": indent_count // 4,
                "faded": False,
                "given": False,
            }
        )

    task_instructions_payload = json.dumps(
        {
            "function_name": function_name,
            "task_instructions": description,
            "examples": "",
        }
    )

    task = Parsons(
        created_by_teacher_id=current_user.id,
        title=final_title,
        task_instructions=task_instructions_payload,
        description=start_description,
        task_type="normal",
        code_blocks={
            "blocks": blocks,
            "function_header": lines[0],
        },
        correct_solution={
            "correct_order": [block["id"] for block in blocks],
            "teacher_tests": tests,
            "solution_code": solution_code,
        },
        is_public=True,
    )

    db.add(task)
    await db.commit()
    await db.refresh(task)

    return {"id": task.id, "message": "Problem created"}

@app.post("/api/register")
async def api_register(request: Request, db: AsyncSession = Depends(get_db)):
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


@app.get("/api/problemsets", response_model=list[ProblemSetResponse])
async def list_problemsets(current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    """List all task lists for the current teacher."""
    stmt = (
        select(TaskList, Teacher.username)
        .join(Teacher, Teacher.id == TaskList.teacher_id)
        .outerjoin(TaskListViewer, TaskListViewer.task_list_id == TaskList.id)
        .where(
            (TaskList.teacher_id == current_user.id)
            | (TaskListViewer.teacher_id == current_user.id)
        )
        .order_by(TaskList.created_at.desc())
        .distinct()
    )
    result = await db.execute(stmt)
    problemsets = result.all()

    return [
        ProblemSetResponse(
            id=ps.id,
            title=ps.title,
            unique_link_code=ps.unique_link_code,
            teacher_id=ps.teacher_id,
            owner_username=owner_username,
            student_description=ps.student_description,
            teacher_description=ps.teacher_description,
            created_at=ps.created_at.isoformat(),
            expires_at=ps.expires_at.isoformat() if ps.expires_at else None,
        )
        for ps, owner_username in problemsets
    ]

@app.get("/api/problemsets/{problemset_id}", response_model=ProblemSetResponse)
async def get_problemset(
    problemset_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db)
):
    stmt = (
        select(TaskList, Teacher.username)
        .join(Teacher, Teacher.id == TaskList.teacher_id)
        .where(TaskList.id == problemset_id)
    )
    result = await db.execute(stmt)
    row = result.first()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Problemset with id {problemset_id} not found",
        )

    problemset, owner_username = row

    await require_task_list_view_access(problemset, current_user, db)

    return ProblemSetResponse(
        id=problemset.id,
        title=problemset.title,
        unique_link_code=problemset.unique_link_code,
        teacher_id=problemset.teacher_id,
        owner_username=owner_username,
        student_description=problemset.student_description,
        teacher_description=problemset.teacher_description,
        created_at=problemset.created_at.isoformat(),
        expires_at=problemset.expires_at.isoformat() if problemset.expires_at else None,
    )


@app.get("/api/problemsets/{code}/tasks", response_model=list[ProblemSetTaskResponse])
async def get_problemset_tasks(code: str, db: AsyncSession = Depends(get_db)):
    """Get all tasks belonging to a problemset. Accepts either a unique link code or an integer ID."""
    # Always try unique_link_code first so numeric codes like "303" still work.
    code_str = str(code)
    problemset_result = await db.execute(
        select(TaskList).where(TaskList.unique_link_code == code_str)
    )
    problemset = problemset_result.scalar_one_or_none()

    # Fallback: allow numeric route segments to address a problemset by ID.
    if problemset is None and code_str.isdigit():
        problemset_result = await db.execute(
            select(TaskList).where(TaskList.id == int(code_str))
        )
        problemset = problemset_result.scalar_one_or_none()

    if not problemset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Problem set '{code}' not found",
        )

    stmt = (
        select(Parsons)
        .join(TaskListItem, TaskListItem.task_id == Parsons.id)
        .where(TaskListItem.task_list_id == problemset.id)
        .order_by(TaskListItem.id.asc())
    )
    result = await db.execute(stmt)
    tasks = result.scalars().all()

    return [
        ProblemSetTaskResponse(
            id=task.id,
            title=task.title,
            task_type=task.task_type,
            created_at=task.created_at.isoformat(),
        )
        for task in tasks
    ]


@app.post("/api/task_lists", response_model=TaskListResponse)
async def create_task_list(
    request: CreateTaskListRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db)
):
    # Verify all tasks exist and belong to the current user
    if request.task_ids:
        task_ids_tuple = tuple(request.task_ids)
        stmt = select(Parsons).where(Parsons.id.in_(task_ids_tuple))
        result = await db.execute(stmt)
        tasks = result.scalars().all()

        if len(tasks) != len(request.task_ids):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="One or more tasks not found"
            )

    # Check if title is unique in the entire database
    stmt = select(TaskList).where(TaskList.title == request.title)
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A task list with the title '{request.title}' already exists in the database. Please use a different title."
        )

    # Parse expiration date if provided
    expires_at = None
    if request.expires_at:
        try:
            expires_at = datetime.fromisoformat(request.expires_at.replace('Z', '+00:00'))
        except (ValueError, AttributeError):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid expiration date format"
            )

    unique_link_code = generate_slug(request.title)

    # Create the task list
    task_list = TaskList(
        teacher_id=current_user.id,
        title=request.title,
        student_description=request.student_description,
        teacher_description=request.teacher_description,
        unique_link_code=unique_link_code,
        expires_at=expires_at
    )

    db.add(task_list)
    await db.flush()  # Get the ID without committing

    # Add tasks to the task list
    for task_id in request.task_ids:
        task_list_item = TaskListItem(
            task_list_id=task_list.id,
            task_id=task_id
        )
        db.add(task_list_item)

    await db.commit()
    await db.refresh(task_list)

    return TaskListResponse(
        id=task_list.id,
        title=task_list.title,
        unique_link_code=task_list.unique_link_code,
        teacher_id=task_list.teacher_id,
        student_description=task_list.student_description,
        teacher_description=task_list.teacher_description,
        created_at=task_list.created_at.isoformat(),
        expires_at=task_list.expires_at.isoformat() if task_list.expires_at else None
    )

#### Who can view problem sets ####

@app.get("/api/problemsets/{problemset_id}/viewers", response_model=list[TaskListViewerResponse])
async def list_problemset_viewers(
    problemset_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(TaskList).where(TaskList.id == problemset_id)
    result = await db.execute(stmt)
    task_list = result.scalar_one_or_none()

    if not task_list:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task list with id {problemset_id} not found"
        )

    await require_task_list_view_access(task_list, current_user, db)

    stmt = (
        select(TaskListViewer, Teacher)
        .join(Teacher, Teacher.id == TaskListViewer.teacher_id)
        .where(TaskListViewer.task_list_id == problemset_id)
        .order_by(Teacher.username.asc())
    )
    result = await db.execute(stmt)
    viewers = result.all()

    return [
        TaskListViewerResponse(
            id=viewer.id,
            task_list_id=viewer.task_list_id,
            teacher_id=teacher.id,
            username=teacher.username,
            email=teacher.email,
            created_at=viewer.created_at.isoformat(),
        )
        for viewer, teacher in viewers
    ]


@app.post("/api/problemsets/{problemset_id}/viewers", response_model=TaskListViewerResponse)
async def add_problemset_viewer(
    problemset_id: int,
    request: TaskListViewerRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db)
):
    identifier = request.identifier.strip()
    if not identifier:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="username or email is required"
        )

    stmt = select(TaskList).where(TaskList.id == problemset_id)
    result = await db.execute(stmt)
    task_list = result.scalar_one_or_none()

    if not task_list:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task list with id {problemset_id} not found"
        )

    if task_list.teacher_id != current_user.id and not current_user.has_data_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to modify this task list"
        )

    teacher_result = await db.execute(
        select(Teacher).where(
            (Teacher.username == identifier) | (Teacher.email == identifier)
        )
    )
    teacher = teacher_result.scalar_one_or_none()

    if not teacher or not teacher.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Teacher not found"
        )

    if teacher.id == task_list.teacher_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Task list owner already has access"
        )

    existing_result = await db.execute(
        select(TaskListViewer).where(
            TaskListViewer.task_list_id == problemset_id,
            TaskListViewer.teacher_id == teacher.id
        )
    )
    existing = existing_result.scalar_one_or_none()

    if existing:
        return TaskListViewerResponse(
            id=existing.id,
            task_list_id=existing.task_list_id,
            teacher_id=teacher.id,
            username=teacher.username,
            email=teacher.email,
            created_at=existing.created_at.isoformat(),
        )

    viewer = TaskListViewer(task_list_id=problemset_id, teacher_id=teacher.id)
    db.add(viewer)
    await db.commit()
    await db.refresh(viewer)

    return TaskListViewerResponse(
        id=viewer.id,
        task_list_id=viewer.task_list_id,
        teacher_id=teacher.id,
        username=teacher.username,
        email=teacher.email,
        created_at=viewer.created_at.isoformat(),
    )


@app.delete("/api/problemsets/{problemset_id}/viewers/{teacher_id}")
async def remove_problemset_viewer(
    problemset_id: int,
    teacher_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(TaskList).where(TaskList.id == problemset_id)
    result = await db.execute(stmt)
    task_list = result.scalar_one_or_none()

    if not task_list:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task list with id {problemset_id} not found"
        )

    if task_list.teacher_id != current_user.id and not current_user.has_data_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to modify this task list"
        )

    if teacher_id == task_list.teacher_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove access from the task list owner"
        )

    delete_stmt = delete(TaskListViewer).where(
        TaskListViewer.task_list_id == problemset_id,
        TaskListViewer.teacher_id == teacher_id
    )
    delete_result = await db.execute(delete_stmt)

    if delete_result.rowcount == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Viewer not found"
        )

    await db.commit()
    return {"status": "success"}


@app.get("/api/problemsets/{problemset_id}/students", response_model=list[StudentInTaskListResponse])
async def get_problemset_students(
    problemset_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db)
):
    """Get all students who have attempted at least one task in this task list."""
    from sqlalchemy import func, distinct

    # Verify task list exists and belongs to current user
    stmt = select(TaskList).where(TaskList.id == problemset_id)
    result = await db.execute(stmt)
    task_list = result.scalar_one_or_none()

    if not task_list:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task list with id {problemset_id} not found"
        )

    await require_task_list_view_access(task_list, current_user, db)

    # Get all tasks in this task list
    task_ids_stmt = select(TaskListItem.task_id).where(TaskListItem.task_list_id == problemset_id)
    task_ids_result = await db.execute(task_ids_stmt)
    task_ids = [row[0] for row in task_ids_result.all()]

    if not task_ids:
        return []

    # Get student sessions with attempts, grouped by session
    # Only include students who accessed this specific task list
    # Counts and timestamps are scoped to attempts on tasks in this list only
    stmt = (
        select(
            Student.username,
            StudentTaskListEnrollment.enrolled_at.label('started_at'),
            func.max(TaskAttempt.completed_at).label('last_activity_at'),
            func.count(TaskAttempt.id).label('total_attempts'),
            func.count(func.distinct(TaskAttempt.task_id)).label('tasks_attempted')
        )
        .join(StudentTaskListEnrollment, StudentTaskListEnrollment.student_id == Student.id)
        .join(TaskAttempt, (TaskAttempt.student_id == Student.id) & (TaskAttempt.task_id.in_(task_ids)))
        .where(StudentTaskListEnrollment.task_list_id == problemset_id)
        .where(Student.username.isnot(None))
        .group_by(Student.id, Student.username, StudentTaskListEnrollment.enrolled_at)
        .order_by(func.max(TaskAttempt.completed_at).desc())
    )

    result = await db.execute(stmt)
    students = result.all()

    return [
        StudentInTaskListResponse(
            username=student.username,
            started_at=student.started_at.isoformat(),
            last_activity_at=student.last_activity_at.isoformat() if student.last_activity_at else student.started_at.isoformat(),
            total_attempts=student.total_attempts,
            tasks_attempted=student.tasks_attempted
        )
        for student in students
    ]


@app.get("/api/students/{student_username}/attempts", response_model=list[StudentTaskAttemptResponse])
async def get_student_attempts(
    student_username: str,
    list_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db)
):
    """Get all tasks attempted by a specific student in a task list."""
    from sqlalchemy import func

    # Verify task list exists and belongs to current user
    stmt = select(TaskList).where(TaskList.id == list_id)
    result = await db.execute(stmt)
    task_list = result.scalar_one_or_none()

    if not task_list:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task list with id {list_id} not found"
        )

    await require_task_list_view_access(task_list, current_user, db)

    # Get all tasks in this task list
    task_ids_stmt = select(TaskListItem.task_id).where(TaskListItem.task_list_id == list_id)
    task_ids_result = await db.execute(task_ids_stmt)
    task_ids = [row[0] for row in task_ids_result.all()]

    if not task_ids:
        return []

    # Get student's attempts grouped by task
    stmt = (
        select(
            Parsons.id,
            Parsons.title,
            Parsons.task_type,
            func.count(TaskAttempt.id).label('attempts'),
            func.sum(func.cast(TaskAttempt.success, Integer)).label('success_count'),
            func.max(TaskAttempt.completed_at).label('last_attempt_at')
        )
        .join(TaskAttempt, TaskAttempt.task_id == Parsons.id)
        .join(Student, Student.id == TaskAttempt.student_id)
        .where(Student.username == student_username)
        .where(Parsons.id.in_(task_ids))
        .group_by(Parsons.id, Parsons.title, Parsons.task_type)
        .order_by(func.max(TaskAttempt.completed_at).desc())
    )

    result = await db.execute(stmt)
    attempts = result.all()

    return [
        StudentTaskAttemptResponse(
            task_id=attempt.id,
            task_title=attempt.title,
            task_type=attempt.task_type,
            attempts=attempt.attempts,
            success_count=attempt.success_count or 0,
            last_attempt_at=attempt.last_attempt_at.isoformat() if attempt.last_attempt_at else ""
        )
        for attempt in attempts
    ]


@app.get("/api/students/{student_username}/tasks/{task_id}/statistics", response_model=StudentTaskStatisticsResponse)
async def get_student_task_statistics(
    student_username: str,
    task_id: int,
    list_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db)
):
    """Get statistics for a specific student's attempts on a specific task."""
    from sqlalchemy import func

    # Verify task list exists and belongs to current user
    stmt = select(TaskList).where(TaskList.id == list_id)
    result = await db.execute(stmt)
    task_list = result.scalar_one_or_none()

    if not task_list:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task list with id {list_id} not found"
        )

    await require_task_list_view_access(task_list, current_user, db)

    # Verify task exists
    task_result = await db.execute(select(Parsons).where(Parsons.id == task_id))
    task = task_result.scalar_one_or_none()

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task with id {task_id} not found"
        )

    # Get all attempts by this student for this task, joined with TaskStart
    from .models import TaskStart

    stmt = (
        select(TaskAttempt, TaskStart)
        .join(Student, Student.id == TaskAttempt.student_id)
        .join(TaskStart, TaskStart.id == TaskAttempt.task_start_id)
        .where(Student.username == student_username)
        .where(TaskAttempt.task_id == task_id)
        .order_by(TaskAttempt.completed_at.asc())
    )

    result = await db.execute(stmt)
    attempts_with_starts = result.all()

    # Unpack into list of (attempt, task_start) tuples for easier access
    attempts_data = [(attempt, task_start) for attempt, task_start in attempts_with_starts]

    # Filter out empty attempts (those with no user-added code)
    empty_attempts_count = 0
    filtered_attempts_data = []
    for attempt, task_start in attempts_data:
        # Keep attempts that don't have code field (e.g., old data, missing field)
        if not (
            attempt.submitted_inputs and isinstance(attempt.submitted_inputs, dict)
        ):
            filtered_attempts_data.append((attempt, task_start))
            continue

        code = attempt.submitted_inputs.get("code", "")
        if not code:
            # No code at all - keep it (might be old attempt format)
            filtered_attempts_data.append((attempt, task_start))
        elif has_user_added_own_code(code, task.code_blocks):
            # Has user-added code - keep it
            filtered_attempts_data.append((attempt, task_start))
        else:
            # Has code but it's empty template - count it
            empty_attempts_count += 1

    attempts_data = filtered_attempts_data

    if not attempts_data:
        return StudentTaskStatisticsResponse(
            task_name=task.title,
            task_description=task.description,
            model_answer=await _get_model_answer_for_task(task, db),
            student_username=student_username,
            total_attempts=0,
            successful_attempts=0,
            failed_attempts=0,
            empty_attempts=0,
            time_to_first_success=None,
            time_to_first_fail=None,
            attempts_detail=[]
        )

    # Calculate statistics
    successful_attempts = sum(1 for a, _ in attempts_data if a.success)
    failed_attempts = sum(1 for a, _ in attempts_data if not a.success)

    # Time to first success
    first_success_pair = next(((a, ts) for a, ts in attempts_data if a.success), None)
    time_to_first_success = None
    if first_success_pair:
        attempt, task_start = first_success_pair
        if task_start and task_start.started_at and attempt.completed_at:
            seconds = (attempt.completed_at - task_start.started_at).total_seconds()
            time_to_first_success = {"seconds": seconds}

    # Time to first fail
    first_fail_pair = next(((a, ts) for a, ts in attempts_data if not a.success), None)
    time_to_first_fail = None
    if first_fail_pair:
        attempt, task_start = first_fail_pair
        if task_start and task_start.started_at and attempt.completed_at:
            seconds = (attempt.completed_at - task_start.started_at).total_seconds()
            time_to_first_fail = {"seconds": seconds}

    # Attempts detail
    attempts_detail = []
    for i, (attempt, task_start) in enumerate(attempts_data, 1):
        time_taken = (attempt.completed_at - task_start.started_at).total_seconds() \
            if task_start and task_start.started_at and attempt.completed_at else None
        detail = {
            "attempt_number": i,
            "success": attempt.success,
            "completed_at": attempt.completed_at.isoformat() if attempt.completed_at else None,
            "time_taken": time_taken,
            "code": attempt.submitted_inputs.get("code") if attempt.submitted_inputs else None,
        }
        attempts_detail.append(detail)

    return StudentTaskStatisticsResponse(
        task_name=task.title,
        task_description=task.description,
        model_answer=await _get_model_answer_for_task(task, db),
        student_username=student_username,
        total_attempts=len(attempts_data),
        successful_attempts=successful_attempts,
        failed_attempts=failed_attempts,
        empty_attempts=empty_attempts_count,
        time_to_first_success=time_to_first_success,
        time_to_first_fail=time_to_first_fail,
        attempts_detail=attempts_detail
    )


@app.get("/api/tasks/{task_id}/statistics")
async def get_task_statistics(
    task_id: int,
    current_user: CurrentUser,
    problemset_code: str | None = None,
    db: AsyncSession = Depends(get_db)
):
    # Verify task exists
    task_result = await db.execute(select(Parsons).where(Parsons.id == task_id))
    task = task_result.scalar_one_or_none()

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task with id {task_id} not found"
        )

    # Build attempts query, optionally filtered by problemset, joined with TaskStart
    from .models import TaskStart

    attempts_query = (
        select(TaskAttempt, TaskStart)
        .join(TaskStart, TaskStart.id == TaskAttempt.task_start_id)
        .where(TaskAttempt.task_id == task_id)
    )

    if problemset_code:
        problemset_result = await db.execute(
            select(TaskList).where(TaskList.unique_link_code == problemset_code)
        )
        problemset = problemset_result.scalar_one_or_none()

        if not problemset:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Problem set '{problemset_code}' not found",
            )

        await require_task_list_view_access(problemset, current_user, db)

        attempts_query = (
            select(TaskAttempt, TaskStart)
            .join(TaskStart, TaskStart.id == TaskAttempt.task_start_id)
            .join(Student, TaskAttempt.student_id == Student.id)
            .join(StudentTaskListEnrollment, StudentTaskListEnrollment.student_id == Student.id)
            .where(
                TaskAttempt.task_id == task_id,
                StudentTaskListEnrollment.task_list_id == problemset.id
            )
        )

    attempts_result = await db.execute(attempts_query)
    attempts_data = [(attempt, task_start) for attempt, task_start in attempts_result.all()]

    # Filter out empty attempts (those with no user-added code)
    filtered_attempts_data = []
    for attempt, task_start in attempts_data:
        if not (attempt.submitted_inputs and isinstance(attempt.submitted_inputs, dict)):
            filtered_attempts_data.append((attempt, task_start))
            continue

        code = attempt.submitted_inputs.get("code", "")
        if not code:
            filtered_attempts_data.append((attempt, task_start))
        elif has_user_added_own_code(code, task.code_blocks):
            filtered_attempts_data.append((attempt, task_start))

    attempts_data = filtered_attempts_data

    if not attempts_data:
        return {
            "task_name": task.title,
            "model_answer": await _get_model_answer_for_task(task, db),
            "total_completions": 0,
            "students_attempted": 0,
            "students_completed": 0,
            "avg_tries": 0,
            "time_to_first_fail": {"avg": 0, "min": 0, "max": 0},
            "time_to_first_success": {"avg": 0, "min": 0, "max": 0},
            "thinking_time": None,
            "number_of_moves": None,
            "common_mistakes": []
        }

    successful_attempts = [(a, ts) for a, ts in attempts_data if a.success]
    failed_attempts = [(a, ts) for a, ts in attempts_data if not a.success]

    students_attempted = len(set(a.student_id for a, _ in attempts_data))
    students_completed = len(set(a.student_id for a, _ in successful_attempts))

    # Average tries before first success (per student)
    student_attempts: dict = {}
    for attempt, task_start in attempts_data:
        student_attempts.setdefault(attempt.student_id, []).append((attempt, task_start))

    tries_before_success = []
    for session_attempts in student_attempts.values():
        sorted_attempts = sorted(
            session_attempts,
            key=lambda pair: pair[0].completed_at or datetime.now(timezone.utc)
        )
        for idx, (attempt, _) in enumerate(sorted_attempts):
            if attempt.success:
                tries_before_success.append(idx + 1)
                break

    avg_tries = sum(tries_before_success) / len(tries_before_success) if tries_before_success else 0

    # Time to first fail (per student)
    tff_values = []
    for session_attempts in student_attempts.values():
        sorted_attempts = sorted(
            session_attempts,
            key=lambda pair: pair[0].completed_at or datetime.now(timezone.utc)
        )
        for attempt, task_start in sorted_attempts:
            if not attempt.success and attempt.completed_at and task_start and task_start.started_at:
                tff_values.append((attempt.completed_at - task_start.started_at).total_seconds())
                break
    tff = {
        "avg": round(sum(tff_values) / len(tff_values), 2) if tff_values else 0,
        "min": round(min(tff_values), 2) if tff_values else 0,
        "max": round(max(tff_values), 2) if tff_values else 0,
    }

    # Time to first success
    tfs_values = []
    for session_attempts in student_attempts.values():
        sorted_attempts = sorted(
            session_attempts,
            key=lambda pair: pair[0].completed_at or datetime.now(timezone.utc)
        )
        for attempt, task_start in sorted_attempts:
            if attempt.success and attempt.completed_at and task_start and task_start.started_at:
                tfs_values.append((attempt.completed_at - task_start.started_at).total_seconds())
                break

    tfs = {
        "avg": round(sum(tfs_values) / len(tfs_values), 2) if tfs_values else 0,
        "min": round(min(tfs_values), 2) if tfs_values else 0,
        "max": round(max(tfs_values), 2) if tfs_values else 0,
    }

    # Common mistakes (top 5 most frequent failed submissions)
    mistake_counts: dict = {}
    for attempt, _ in failed_attempts:
        if attempt.submitted_inputs and isinstance(attempt.submitted_inputs, dict):
            code = attempt.submitted_inputs.get("code", "")
            if code:
                normalized_code = _clean_mistake_code(code)
                if not normalized_code:
                    continue

                fingerprint = _mistake_code_fingerprint(normalized_code)
                if fingerprint not in mistake_counts:
                    mistake_counts[fingerprint] = {"code": normalized_code, "count": 0}

                mistake_counts[fingerprint]["count"] += 1
                if len(normalized_code) < len(mistake_counts[fingerprint]["code"]):
                    mistake_counts[fingerprint]["code"] = normalized_code

    common_mistakes = [
        {"code": mistake["code"], "count": mistake["count"]}
        for mistake in sorted(mistake_counts.values(), key=lambda item: item["count"], reverse=True)[:5]
    ]

    return {
        "task_name": task.title,
        "model_answer": await _get_model_answer_for_task(task, db),
        "total_completions": len(attempts_data),
        "students_attempted": students_attempted,
        "students_completed": students_completed,
        "avg_tries": round(avg_tries, 2),
        "time_to_first_fail": tff,
        "time_to_first_success": tfs,
        "thinking_time": None,   # Not yet tracked — requires first-action event
        "number_of_moves": None, # Not yet tracked — requires move_events table
        "common_mistakes": common_mistakes,
    }

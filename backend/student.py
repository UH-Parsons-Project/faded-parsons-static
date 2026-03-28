from datetime import datetime, timezone
from pathlib import Path


from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .pydantic import BlockMoveEventRequest

from .database import get_db
from .models import Parsons, Student, TaskAttempt, TaskList, MoveEvent
from .student_auth import (
    authenticate_student,
    set_session_cookie,
    get_current_student_session,
    get_current_student_session_no_update,
)

BASE_DIR = Path(__file__).resolve().parent.parent

router = APIRouter()


@router.get("/student_start_page", response_class=FileResponse)
async def student_start_view():
    index_path = BASE_DIR / "templates" / "student_start_page.html"
    return FileResponse(index_path)


@router.get("/set/{unique_link_code}", response_class=FileResponse)
async def problemset_page(
    unique_link_code: str,
    db: AsyncSession = Depends(get_db),
    student_session: Student | None = Depends(get_current_student_session_no_update),
):
    stmt = select(TaskList).where(TaskList.unique_link_code == unique_link_code)
    result = await db.execute(stmt)
    problemset = result.scalar_one_or_none()

    if not problemset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Problem set with code {unique_link_code} not found",
        )

    if student_session:
        return RedirectResponse(url=f"/set/{unique_link_code}/tasks", status_code=status.HTTP_303_SEE_OTHER)

    problemset_path = BASE_DIR / "templates" / "student_index.html"
    response = FileResponse(problemset_path)
    response.headers["X-Problemset-Code"] = unique_link_code
    return response


@router.get("/set/{unique_link_code}/tasks", response_class=FileResponse)
async def problemset_tasks_page(
    unique_link_code: str,
    db: AsyncSession = Depends(get_db),
    student_session: Student | None = Depends(get_current_student_session_no_update),
):
    stmt = select(TaskList).where(TaskList.unique_link_code == unique_link_code)
    result = await db.execute(stmt)
    problemset = result.scalar_one_or_none()

    if not problemset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Problem set with code {unique_link_code} not found",
        )

    if not student_session:
        return RedirectResponse(url=f"/set/{unique_link_code}", status_code=status.HTTP_303_SEE_OTHER)

    tasks_path = BASE_DIR / "templates" / "problemset.html"
    response = FileResponse(tasks_path)
    response.headers["X-Problemset-Code"] = unique_link_code
    return response


@router.get("/set/{unique_link_code}/tasks/{task_id:int}", response_class=FileResponse)
async def problemset_task_page(
    unique_link_code: str,
    task_id: int,
    db: AsyncSession = Depends(get_db),
    student_session: Student | None = Depends(get_current_student_session_no_update),
):
    stmt = select(TaskList).where(TaskList.unique_link_code == unique_link_code)
    result = await db.execute(stmt)
    problemset = result.scalar_one_or_none()

    if not problemset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Problem set with code {unique_link_code} not found",
        )

    if not student_session:
        return RedirectResponse(url=f"/set/{unique_link_code}", status_code=status.HTTP_303_SEE_OTHER)

    task_path = BASE_DIR / "templates" / "student_problem.html"
    response = FileResponse(task_path)
    response.headers["X-Problemset-Code"] = unique_link_code
    response.headers["X-Task-Id"] = str(task_id)
    return response


@router.get("/set/{unique_link_code}/tasks/{task_id:int}/start", response_class=FileResponse)
async def problemset_task_start_page(
    unique_link_code: str,
    task_id: int,
    db: AsyncSession = Depends(get_db),
    student_session: Student | None = Depends(get_current_student_session_no_update),
):
    stmt = select(TaskList).where(TaskList.unique_link_code == unique_link_code)
    result = await db.execute(stmt)
    problemset = result.scalar_one_or_none()

    if not problemset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Problem set with code {unique_link_code} not found",
        )

    if not student_session:
        return RedirectResponse(url=f"/set/{unique_link_code}", status_code=status.HTTP_303_SEE_OTHER)

    start_path = BASE_DIR / "templates" / "student_start_page.html"
    response = FileResponse(start_path)
    response.headers["X-Problemset-Code"] = unique_link_code
    response.headers["X-Task-Id"] = str(task_id)
    return response


@router.get("/student_register", response_class=FileResponse)
async def student_register_page():
    register_path = BASE_DIR / "templates" / "student_register.html"
    return FileResponse(register_path)


@router.post("/api/student_login")
async def student_login(
    request: dict,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    # request expected to follow StudentLoginRequest structure
    username = request.get("username") if isinstance(request, dict) else None
    password = request.get("password") if isinstance(request, dict) else None
    unique_link_code = request.get("unique_link_code") if isinstance(request, dict) else None

    if username is None or password is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="username and password are required")

    student = await authenticate_student(username, password, db)
    if not student:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect username or password",
        )

    now = datetime.now(timezone.utc)
    student.last_activity_at = now
    if not student.started_at:
        student.started_at = now

    if unique_link_code:
        stmt = select(TaskList).where(TaskList.unique_link_code == unique_link_code)
        result = await db.execute(stmt)
        task_list = result.scalar_one_or_none()
        if task_list:
            student.task_list_id = task_list.id

    await db.commit()

    set_session_cookie(response, student.id)
    return {"status": "success", "student_id": student.id}


@router.post("/api/student_logout")
async def student_logout(response: Response):
    response.delete_cookie(key="student_session", path="/")
    return {"message": "Successfully logged out"}


@router.post("/api/student_register")
async def api_student_register(request: dict, db: AsyncSession = Depends(get_db)):
    try:
        payload = request if isinstance(request, dict) else await request.json()
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON payload")

    username = str(payload.get("username", "")).strip()
    password = payload.get("password", "")
    password_confirm = payload.get("password_confirm", "")
    email = str(payload.get("email", "")).strip()

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

    if len(username) > 20 or len(email) > 100:
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
    stmt = select(Student).where((Student.username == username) | (Student.email == email))
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username or email already exists",
        )

    student = Student(username=username, email=email)
    student.set_password(password)

    db.add(student)
    await db.commit()
    await db.refresh(student)

    return {"status": "success", "id": student.id}


@router.get("/api/tasks/{task_id}/check-start")
async def check_task_start(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    student_session: Student | None = Depends(get_current_student_session),
):
    if not student_session:
        return {"has_started": False}

    stmt = select(TaskAttempt).where(
        (TaskAttempt.student_id == student_session.id) &
        (TaskAttempt.task_id == task_id)
    )
    result = await db.execute(stmt)
    attempt = result.scalar_one_or_none()

    if attempt:
        return {
            "has_started": True,
            "started_at": attempt.task_started_at.isoformat()
        }

    return {"has_started": False}


@router.post("/api/tasks/{task_id}/start")
async def start_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    student_session: Student | None = Depends(get_current_student_session),
):
    if not student_session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Student session required to start a task"
        )

    # Create a new task attempt with current timestamp
    new_attempt = TaskAttempt(
        student_id=student_session.id,
        task_id=task_id,
        task_started_at=datetime.now(timezone.utc),
    )
    db.add(new_attempt)
    await db.commit()
    await db.refresh(new_attempt)

    return {
        "status": "success",
        "attempt_id": new_attempt.id,
        "started_at": new_attempt.task_started_at.isoformat()
    }


@router.post("/api/tasks/{task_id}/submit-result")
async def submit_test_result(
    task_id: int,
    result: dict,
    db: AsyncSession = Depends(get_db),
    student_session: Student | None = Depends(get_current_student_session),
):
    if not student_session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Student session required to save results"
        )

    # Update the first task attempt for this student and task with completion info
    stmt = select(TaskAttempt).where(
        (TaskAttempt.student_id == student_session.id) &
        (TaskAttempt.task_id == task_id)
    ).order_by(TaskAttempt.task_started_at)
    result_query = await db.execute(stmt)
    attempt = result_query.scalars().first()

    if attempt:
        # Update existing attempt with results
        attempt.completed_at = datetime.now(timezone.utc)
        attempt.success = result.get("success", False)
        attempt.submitted_inputs = {"code": result.get("submitted_code")}
    else:
        # Fallback: create new attempt if one doesn't exist
        attempt = TaskAttempt(
            student_id=student_session.id,
            task_id=task_id,
            task_started_at=datetime.now(timezone.utc),
            completed_at=datetime.now(timezone.utc),
            success=result.get("success", False),
            submitted_inputs={"code": result.get("submitted_code")}
        )
        db.add(attempt)

    await db.commit()

    return {"status": "success", "message": "Test result saved"}


@router.post("/api/block-move")
async def log_block_move(
    move_event: BlockMoveEventRequest,
    db: AsyncSession = Depends(get_db),
    student_session: Student | None = Depends(get_current_student_session),
):
    if not student_session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Student session required to log block moves"
        )

    # Verify the attempt belongs to this student
    stmt = select(TaskAttempt).where(TaskAttempt.id == move_event.attempt_id)
    result = await db.execute(stmt)
    attempt = result.scalar_one_or_none()

    if not attempt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task attempt not found"
        )

    if attempt.student_id != student_session.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot log moves for another student's attempt"
        )

    # Create and save the move event
    move = MoveEvent(
        attempt_id=move_event.attempt_id,
        block_id=move_event.block_id,
        from_container=move_event.from_container,
        to_container=move_event.to_container,
        from_index=move_event.from_index,
        to_index=move_event.to_index,
        from_indent=move_event.from_indent,
        to_indent=move_event.to_indent,
    )
    db.add(move)
    await db.commit()

    return {"status": "success", "message": "Block move logged"}

@router.get("/api/students/{student_username}/tasks/{task_id}/moves")
async def get_task_moves(
    student_username: str,
    task_id: int,
    list_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_student_session_no_update),
):
    """Fetch all moves for a student's attempts on a specific task."""
    # Find student by username
    stmt = select(Student).where(Student.username == student_username)
    result = await db.execute(stmt)
    student = result.scalar_one_or_none()

    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Fetch all attempts for this student on this task
    stmt = select(TaskAttempt).where(
        (TaskAttempt.student_id == student.id) &
        (TaskAttempt.task_id == task_id)
    )
    result = await db.execute(stmt)
    attempts = result.scalars().all()

    attempt_ids = [a.id for a in attempts]

    # Fetch all moves for these attempts
    if not attempt_ids:
        return []

    stmt = select(MoveEvent).where(MoveEvent.attempt_id.in_(attempt_ids)).order_by(MoveEvent.event_time.asc())
    result = await db.execute(stmt)
    moves = result.scalars().all()

    return [
        {
            "block_id": move.block_id,
            "from_container": move.from_container,
            "to_container": move.to_container,
            "from_index": move.from_index,
            "to_index": move.to_index,
            "from_indent": move.from_indent,
            "to_indent": move.to_indent,
            "event_time": move.event_time.isoformat(),
        }
        for move in moves
    ]

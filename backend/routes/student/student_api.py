from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...pydantic import SubmitTestResultRequest, RecordExitRequest, EnterTaskResponse
from ...database import get_db
from ...models import Student, StudentTaskSetEnrollment, TaskAttempt, TaskSet, MoveEvent, TaskStart, TaskSession, EditEvent, Parsons, Parsons, EditEvent
from ...student_auth import (
    authenticate_student,
    set_session_cookie,
    get_current_student_session,
    get_current_student_session_no_update,
)

from ..utils.commons import validate_registration_basic, ensure_unique_user

router = APIRouter()


@router.post("/api/student_login")
async def student_login(
    request: dict,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
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
        stmt = select(TaskSet).where(TaskSet.unique_link_code == unique_link_code)
        result = await db.execute(stmt)
        task_set = result.scalar_one_or_none()
        if task_set:
            enroll_result = await db.execute(
                select(StudentTaskSetEnrollment).where(
                    StudentTaskSetEnrollment.student_id == student.id,
                    StudentTaskSetEnrollment.task_set_id == task_set.id,
                )
            )
            if not enroll_result.scalar_one_or_none():
                db.add(StudentTaskSetEnrollment(
                    student_id=student.id,
                    task_set_id=task_set.id,
                ))

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

    # Basic validation (lengths, presence, password match)
    validate_registration_basic(username, password, password_confirm, email,
                                username_max=20, email_max=100)

    # Ensure uniqueness in DB
    await ensure_unique_user(db, Student, username, email)

    student = Student(username=username, email=email)
    student.set_password(password)

    db.add(student)
    await db.commit()
    await db.refresh(student)

    return {"status": "success", "id": student.id}


@router.get("/api/tasks/{task_id}/has-started")
async def check_task_has_started(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    student_session: Student | None = Depends(get_current_student_session),
):
    if not student_session:
        return {"has_started": False}

    stmt = select(TaskStart).where(
        (TaskStart.student_id == student_session.id) &
        (TaskStart.task_id == task_id)
    )
    result = await db.execute(stmt)
    existing_start = result.scalar_one_or_none()

    return {"has_started": existing_start is not None}


@router.get("/api/tasks/{task_id}/my-completion-status")
async def get_my_completion_status(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    student_session: Student | None = Depends(get_current_student_session_no_update),
):
    if not student_session:
        return {"student_attempts": 0, "student_completed": 0}

    stmt = select(TaskAttempt).where(
        (TaskAttempt.student_id == student_session.id) &
        (TaskAttempt.task_id == task_id)
    )
    result = await db.execute(stmt)
    attempts = result.scalars().all()

    student_attempts = len(attempts)
    student_completed = sum(1 for a in attempts if a.success)

    return {"student_attempts": student_attempts, "student_completed": student_completed}


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

    stmt = select(TaskStart).where(
        (TaskStart.student_id == student_session.id) &
        (TaskStart.task_id == task_id)
    )
    result = await db.execute(stmt)
    task_start = result.scalar_one_or_none()

    if task_start:
        return {
            "status": "success",
            "started_at": task_start.started_at.isoformat()
        }

    new_start = TaskStart(
        student_id=student_session.id,
        task_id=task_id
    )
    db.add(new_start)
    await db.commit()
    await db.refresh(new_start)

    return {
        "status": "success",
        "started_at": new_start.started_at.isoformat()
    }


@router.post("/api/tasks/{task_id}/submit-result")
async def submit_test_result(
    task_id: int,
    result: SubmitTestResultRequest,
    db: AsyncSession = Depends(get_db),
    student_session: Student | None = Depends(get_current_student_session),
):
    if not student_session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Student session required to save results"
        )

    start_stmt = select(TaskStart).where(
        (TaskStart.student_id == student_session.id) &
        (TaskStart.task_id == task_id)
    )
    start_result = await db.execute(start_stmt)
    task_start = start_result.scalar_one_or_none()

    if not task_start:
        task_start = TaskStart(
            student_id=student_session.id,
            task_id=task_id
        )
        db.add(task_start)
        await db.flush()

    new_attempt = TaskAttempt(
        student_id=student_session.id,
        task_id=task_id,
        task_start_id=task_start.id,
        completed_at=datetime.now(timezone.utc),
        success=result.success,
        submitted_inputs={"code": result.submitted_code}
    )
    db.add(new_attempt)
    await db.flush()
    await db.refresh(new_attempt)

    if result.moves:
        for move_data in result.moves:
            move_kwargs = dict(
                attempt_id=new_attempt.id,
                block_id=move_data.block_id,
                from_container=move_data.from_container,
                to_container=move_data.to_container,
                from_index=move_data.from_index,
                to_index=move_data.to_index,
                from_indent=move_data.from_indent,
                to_indent=move_data.to_indent,
            )
            if move_data.event_time:
                move_kwargs["event_time"] = datetime.fromisoformat(move_data.event_time)
            db.add(MoveEvent(**move_kwargs))

    if result.edits:
        for edit_data in result.edits:
            edit = EditEvent(
                attempt_id=new_attempt.id,
                block_id=edit_data.block_id,
                blank_index=edit_data.blank_index,
                value=edit_data.value,
                event_time=datetime.fromisoformat(edit_data.event_time),
            )
            db.add(edit)

    await db.commit()

    return {
        "status": "success",
        "message": "Test result saved",
        "attempt_id": new_attempt.id
    }


@router.post("/api/tasks/{task_id}/enter", response_model=EnterTaskResponse)
async def enter_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    student_session: Student | None = Depends(get_current_student_session),
):
    if not student_session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Student session required"
        )

    stmt = select(TaskStart).where(
        (TaskStart.student_id == student_session.id) &
        (TaskStart.task_id == task_id)
    )
    result = await db.execute(stmt)
    task_start = result.scalar_one_or_none()

    if not task_start:
        task_start = TaskStart(student_id=student_session.id, task_id=task_id)
        db.add(task_start)
        await db.flush()

    session = TaskSession(task_start_id=task_start.id)
    db.add(session)
    await db.commit()
    await db.refresh(session)

    return EnterTaskResponse(
        session_id=session.id,
        entered_at=session.entered_at.isoformat(),
    )


@router.post("/api/tasks/{task_id}/record-exit")
async def record_task_exit(
    task_id: int,
    body: RecordExitRequest,
    db: AsyncSession = Depends(get_db),
    student_session: Student | None = Depends(get_current_student_session_no_update),
):
    if not student_session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Student session required"
        )

    stmt = (
        select(TaskSession)
        .join(TaskStart, TaskStart.id == TaskSession.task_start_id)
        .where(TaskSession.id == body.session_id)
        .where(TaskStart.student_id == student_session.id)
        .where(TaskStart.task_id == task_id)
    )
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session.exited_at = datetime.fromisoformat(body.exited_at)
    session.exit_reason = body.exit_reason
    await db.commit()
    return {"status": "success"}


@router.get("/api/students/{student_username}/tasks/{task_id}/moves")
async def get_task_moves(
    student_username: str,
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_student_session_no_update),
):
    stmt = select(Student).where(Student.username == student_username)
    result = await db.execute(stmt)
    student = result.scalar_one_or_none()

    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    stmt = select(TaskAttempt).where(
        (TaskAttempt.student_id == student.id) &
        (TaskAttempt.task_id == task_id)
    )
    result = await db.execute(stmt)
    attempts = result.scalars().all()

    attempt_ids = [a.id for a in attempts]

    if not attempt_ids:
        return []

    stmt = select(MoveEvent).where(MoveEvent.attempt_id.in_(attempt_ids))
    result = await db.execute(stmt)
    moves = result.scalars().all()

    stmt = select(EditEvent).where(EditEvent.attempt_id.in_(attempt_ids))
    result = await db.execute(stmt)
    edits = result.scalars().all()

    task_result = await db.execute(select(Parsons).where(Parsons.id == task_id))
    task = task_result.scalar_one_or_none()

    # main.js appends these 4 extra lines to codeLines before passing to the widget,
    # so they get sortable-codelineN IDs just like real blocks and live in the starter.
    DEBUG_LINES = [
        {"code": "print('DEBUG:', !BLANK)", "given": False, "indent": 0},
        {"code": "print('DEBUG:', !BLANK)", "given": False, "indent": 0},
        {"code": "# !BLANK", "given": False, "indent": 0},
        {"code": "# !BLANK", "given": False, "indent": 0},
    ]

    initial_blocks = []
    block_code_map = {}
    if task and task.code_blocks and "blocks" in task.code_blocks:
        draggable_index = 0
        for block in task.code_blocks["blocks"]:
            if not block.get("given", False):
                block_id = f"sortable-codeline{draggable_index}"
                block_code_map[block_id] = block["code"]
                initial_blocks.append({
                    "block_id": block_id,
                    "code": block["code"],
                    "given": False,
                    "indent": block.get("indent", 0),
                })
                draggable_index += 1
        # Debug lines come before given blocks in the widget's modified_lines
        for debug in DEBUG_LINES:
            block_id = f"sortable-codeline{draggable_index}"
            block_code_map[block_id] = debug["code"]
            initial_blocks.append({
                "block_id": block_id,
                "code": debug["code"],
                "given": False,
                "indent": 0,
                "debug": True,
            })
            draggable_index += 1
        # Given blocks come last in the widget's modified_lines
        for block in task.code_blocks["blocks"]:
            if block.get("given", False):
                block_id = f"sortable-codeline{draggable_index}"
                block_code_map[block_id] = block["code"]
                initial_blocks.append({
                    "block_id": block_id,
                    "code": block["code"],
                    "given": True,
                    "indent": block.get("indent", 0),
                })
                draggable_index += 1

    move_events = [
        {
            "type": "move",
            "block_id": move.block_id,
            "block_code": block_code_map.get(move.block_id, ""),
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

    edit_events = [
        {
            "type": "edit",
            "block_id": edit.block_id,
            "block_code": block_code_map.get(edit.block_id, ""),
            "blank_index": edit.blank_index,
            "value": edit.value,
            "event_time": edit.event_time.isoformat(),
        }
        for edit in edits
    ]

    all_events = sorted(move_events + edit_events, key=lambda e: e["event_time"])

    return {
        "events": all_events,
        "initial_blocks": initial_blocks,
    }

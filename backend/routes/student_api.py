from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

<<<<<<< HEAD:backend/routes/student_api.py
from ..pydantic import SubmitTestResultRequest
from ..database import get_db
from ..models import Student, StudentTaskListEnrollment, TaskAttempt, TaskList, MoveEvent, TaskStart
from ..student_auth import (
=======
from .pydantic import SubmitTestResultRequest, ProblemSetInfoResponse

from .database import get_db
from .models import Student, StudentTaskListEnrollment, TaskAttempt, TaskList, MoveEvent, EditEvent, TaskStart, Parsons
from .student_auth import (
>>>>>>> c25460c (Prettier student tasks page):backend/student.py
    authenticate_student,
    set_session_cookie,
    get_current_student_session,
    get_current_student_session_no_update,
)

router = APIRouter()


<<<<<<< HEAD:backend/routes/student_api.py
=======
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


@router.get("/api/problemsets/{code}/info", response_model=ProblemSetInfoResponse)
async def get_problemset_info(code: str, db: AsyncSession = Depends(get_db)):
	"""Get public info about a problemset (title and student description)."""
	code_str = str(code)
	problemset_result = await db.execute(
		select(TaskList).where(TaskList.unique_link_code == code_str)
	)
	problemset = problemset_result.scalar_one_or_none()

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

	return ProblemSetInfoResponse(
		id=problemset.id,
		title=problemset.title,
		student_description=problemset.student_description,
	)


@router.get("/student_register", response_class=FileResponse)
async def student_register_page():
    register_path = BASE_DIR / "templates" / "student_register.html"
    return FileResponse(register_path)


>>>>>>> c25460c (Prettier student tasks page):backend/student.py
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
        stmt = select(TaskList).where(TaskList.unique_link_code == unique_link_code)
        result = await db.execute(stmt)
        task_list = result.scalar_one_or_none()
        if task_list:
            enroll_result = await db.execute(
                select(StudentTaskListEnrollment).where(
                    StudentTaskListEnrollment.student_id == student.id,
                    StudentTaskListEnrollment.task_list_id == task_list.id,
                )
            )
            if not enroll_result.scalar_one_or_none():
                db.add(StudentTaskListEnrollment(
                    student_id=student.id,
                    task_list_id=task_list.id,
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

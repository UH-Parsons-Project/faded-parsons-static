from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func, and_
import json

from ...database import get_db
from ...models import Parsons
from ...pydantic import TaskResponse, CreateProblemRequest
from ...auth import CurrentUser
from ...models import Parsons, TaskSet, Teacher, TaskSetViewer, TaskSetItem, TeacherFavoriteTask
from ...models import Student, StudentTaskSetEnrollment, StudentTaskEnrollment, TaskAttempt
from ...models import ModelAnswer
from ...pydantic import (
    TaskResponse,
    CreateProblemRequest,
    TaskSetResponse,
    TaskSetTaskResponse,
    TaskSetResponse,
    TaskSetViewerResponse,
    TaskSetViewerRequest,
    CreateTaskSetRequest,
    StudentInTaskSetResponse,
    TeacherLookupResponse,
)
from ...auth import CurrentUser
from backend.utils import generate_slug
from datetime import datetime

# router already declared above
router = APIRouter()
from ..utils.commons import build_taskset_response_list, get_task_set_or_404, fetch_nonempty_ids, run_with_task_ids_or_empty
from ...utils.taskset import has_task_set_view_access, require_task_set_view_access
from ...utils.task import is_task_editable


@router.get("/api/my_sets", response_model=list[TaskSetResponse])
async def list_my_sets(current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    """List all task sets for the current teacher."""
    stmt = (
        select(TaskSet, Teacher.username)
        .join(Teacher, Teacher.id == TaskSet.teacher_id)
        .outerjoin(TaskSetViewer, TaskSetViewer.task_set_id == TaskSet.id)
        .where(
            (TaskSet.teacher_id == current_user.id) | (TaskSetViewer.teacher_id == current_user.id)
        )
        .order_by(TaskSet.created_at.desc())
        .distinct()
    )
    result = await db.execute(stmt)
    my_sets = result.all()

    return build_taskset_response_list(my_sets)


@router.get("/api/my_sets/{task_set_id}", response_model=TaskSetResponse)
async def get_task_set(
    task_set_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db)
):
    stmt = (
        select(TaskSet, Teacher.username)
        .join(Teacher, Teacher.id == TaskSet.teacher_id)
        .where(TaskSet.id == task_set_id)
    )
    result = await db.execute(stmt)
    row = result.first()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Problemset with id {task_set_id} not found",
        )

    task_set, owner_username = row

    await require_task_set_view_access(task_set, current_user, db)

    return TaskSetResponse(
        id=task_set.id,
        title=task_set.title,
        unique_link_code=task_set.unique_link_code,
        teacher_id=task_set.teacher_id,
        owner_username=owner_username,
        student_description=task_set.student_description,
        teacher_description=task_set.teacher_description,
        created_at=task_set.created_at.isoformat(),
        expires_at=task_set.expires_at.isoformat() if task_set.expires_at else None,
    )


@router.get("/api/my_sets/{code}/tasks", response_model=list[TaskSetTaskResponse])
async def get_task_set_tasks(code: str, db: AsyncSession = Depends(get_db)):
    """Get all tasks belonging to a task_set. Accepts either a unique link code or an integer ID."""
    code_str = str(code)
    task_set_result = await db.execute(
        select(TaskSet).where(TaskSet.unique_link_code == code_str)
    )
    task_set = task_set_result.scalar_one_or_none()

    if task_set is None and code_str.isdigit():
        task_set_result = await db.execute(
            select(TaskSet).where(TaskSet.id == int(code_str))
        )
        task_set = task_set_result.scalar_one_or_none()

    if not task_set:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Problem set '{code}' not found",
        )

    stmt = (
        select(Parsons)
        .join(TaskSetItem, TaskSetItem.task_id == Parsons.id)
        .where(TaskSetItem.task_set_id == task_set.id)
        .order_by(TaskSetItem.id.asc())
    )
    result = await db.execute(stmt)
    tasks = result.scalars().all()

    return [
        TaskSetTaskResponse(
            id=task.id,
            title=task.title,
            task_type=task.task_type,
            created_at=task.created_at.isoformat(),
        )
        for task in tasks
    ]


@router.get("/api/my_sets/{code}/info", response_model=TaskSetResponse)
async def get_task_set_info(code: str, db: AsyncSession = Depends(get_db)):
    """Get info for a task set by unique link code or integer ID."""
    code_str = str(code)
    stmt = (
        select(TaskSet, Teacher.username)
        .join(Teacher, Teacher.id == TaskSet.teacher_id)
        .where(TaskSet.unique_link_code == code_str)
    )
    result = await db.execute(stmt)
    row = result.first()

    if row is None and code_str.isdigit():
        stmt = (
            select(TaskSet, Teacher.username)
            .join(Teacher, Teacher.id == TaskSet.teacher_id)
            .where(TaskSet.id == int(code_str))
        )
        result = await db.execute(stmt)
        row = result.first()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Problem set '{code}' not found",
        )

    task_set, owner_username = row

    return TaskSetResponse(
        id=task_set.id,
        title=task_set.title,
        unique_link_code=task_set.unique_link_code,
        teacher_id=task_set.teacher_id,
        owner_username=owner_username,
        student_description=task_set.student_description,
        teacher_description=task_set.teacher_description,
        created_at=task_set.created_at.isoformat(),
        expires_at=task_set.expires_at.isoformat() if task_set.expires_at else None,
    )


@router.get("/api/teachers/lookup", response_model=TeacherLookupResponse)
async def lookup_teacher(
    identifier: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db)
):
    identifier = identifier.strip()
    if not identifier:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="identifier is required")

    result = await db.execute(
        select(Teacher).where(
            (Teacher.username == identifier) | (Teacher.email == identifier)
        )
    )
    teacher = result.scalar_one_or_none()

    if not teacher or not teacher.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Teacher not found")

    return TeacherLookupResponse(
        teacher_id=teacher.id,
        username=teacher.username,
        email=teacher.email,
    )


@router.post("/api/create_task_set", response_model=TaskSetResponse)
async def create_task_set(
    request: CreateTaskSetRequest,
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
    stmt = select(TaskSet).where(TaskSet.title == request.title)
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A task set with the title '{request.title}' already exists in the database. Please use a different title."
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

    base_slug = generate_slug(request.title)
    unique_link_code = base_slug
    suffix = 2
    while True:
        stmt = select(TaskSet).where(TaskSet.unique_link_code == unique_link_code)
        result = await db.execute(stmt)
        if not result.scalar_one_or_none():
            break
        unique_link_code = f"{base_slug}-{suffix}"
        suffix += 1

    # Create the task set
    task_set = TaskSet(
        teacher_id=current_user.id,
        title=request.title,
        student_description=request.student_description,
        teacher_description=request.teacher_description,
        unique_link_code=unique_link_code,
        expires_at=expires_at
    )

    db.add(task_set)
    await db.flush()

    for task_id in request.task_ids:
        task_set_item = TaskSetItem(
            task_set_id=task_set.id,
            task_id=task_id
        )
        db.add(task_set_item)

    await db.commit()
    await db.refresh(task_set)

    return TaskSetResponse(
        id=task_set.id,
        title=task_set.title,
        unique_link_code=task_set.unique_link_code,
        teacher_id=task_set.teacher_id,
        owner_username=current_user.username,
        student_description=task_set.student_description,
        teacher_description=task_set.teacher_description,
        created_at=task_set.created_at.isoformat(),
        expires_at=task_set.expires_at.isoformat() if task_set.expires_at else None
    )


@router.get("/api/my_sets/{task_set_id}/viewers", response_model=list[TaskSetViewerResponse])
async def list_task_set_viewers(
    task_set_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db)
):
    task_set = await get_task_set_or_404(db, TaskSet, task_set_id)
    await require_task_set_view_access(task_set, current_user, db)

    stmt = (
        select(TaskSetViewer, Teacher)
        .join(Teacher, Teacher.id == TaskSetViewer.teacher_id)
        .where(TaskSetViewer.task_set_id == task_set_id)
        .order_by(Teacher.username.asc())
    )
    result = await db.execute(stmt)
    viewers = result.all()

    return [
        TaskSetViewerResponse(
            id=viewer.id,
            task_set_id=viewer.task_set_id,
            teacher_id=teacher.id,
            username=teacher.username,
            email=teacher.email,
            created_at=viewer.created_at.isoformat(),
        )
        for viewer, teacher in viewers
    ]


@router.post("/api/my_sets/{task_set_id}/viewers", response_model=TaskSetViewerResponse)
async def add_task_set_viewer(
    task_set_id: int,
    request: TaskSetViewerRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db)
):
    identifier = request.identifier.strip()
    if not identifier:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="username or email is required"
        )

    task_set = await get_task_set_or_404(db, TaskSet, task_set_id)

    if task_set.teacher_id != current_user.id and not current_user.is_admin_teacher:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to modify this task set"
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

    if teacher.id == task_set.teacher_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Task list owner already has access"
        )

    existing_result = await db.execute(
        select(TaskSetViewer).where(
            TaskSetViewer.task_set_id == task_set_id,
            TaskSetViewer.teacher_id == teacher.id
        )
    )
    existing = existing_result.scalar_one_or_none()

    if existing:
        return TaskSetViewerResponse(
            id=existing.id,
            task_set_id=existing.task_set_id,
            teacher_id=teacher.id,
            username=teacher.username,
            email=teacher.email,
            created_at=existing.created_at.isoformat(),
        )

    viewer = TaskSetViewer(task_set_id=task_set_id, teacher_id=teacher.id)
    db.add(viewer)
    await db.commit()
    await db.refresh(viewer)

    return TaskSetViewerResponse(
        id=viewer.id,
        task_set_id=viewer.task_set_id,
        teacher_id=teacher.id,
        username=teacher.username,
        email=teacher.email,
        created_at=viewer.created_at.isoformat(),
    )


@router.delete("/api/my_sets/{task_set_id}/viewers/{teacher_id}")
async def remove_task_set_viewer(
    task_set_id: int,
    teacher_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db)
):
    task_set = await get_task_set_or_404(db, TaskSet, task_set_id)

    if task_set.teacher_id != current_user.id and not current_user.is_admin_teacher:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to modify this task set"
        )

    if teacher_id == task_set.teacher_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove access from the task set owner"
        )

    delete_stmt = delete(TaskSetViewer).where(
        TaskSetViewer.task_set_id == task_set_id,
        TaskSetViewer.teacher_id == teacher_id
    )
    delete_result = await db.execute(delete_stmt)

    if delete_result.rowcount == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Viewer not found"
        )

    await db.commit()
    return {"status": "success"}


@router.get("/api/my_sets/{task_set_id}/students", response_model=list[StudentInTaskSetResponse])
async def get_task_set_students(
    task_set_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db)
):
    """Get all students who have attempted at least one task in this task set."""
    # Verify task set exists and belongs to current user
    task_set = await get_task_set_or_404(db, TaskSet, task_set_id)
    await require_task_set_view_access(task_set, current_user, db)

    task_ids_stmt = select(TaskSetItem.task_id).where(TaskSetItem.task_set_id == task_set_id)

    async def _handler(task_ids):
        stmt = (
            select(
                Student.username,
                StudentTaskSetEnrollment.enrolled_at.label('started_at'),
                func.max(TaskAttempt.completed_at).label('last_activity_at'),
                func.count(TaskAttempt.id).label('total_attempts'),
                func.count(func.distinct(TaskAttempt.task_id)).label('tasks_attempted')
            )
            .join(StudentTaskSetEnrollment, (StudentTaskSetEnrollment.student_id == Student.id) & (StudentTaskSetEnrollment.task_set_id == task_set_id))
            .outerjoin(TaskAttempt, and_(
                TaskAttempt.student_id == Student.id,
                TaskAttempt.task_id.in_(task_ids),
                TaskAttempt.task_id.in_(
                    select(StudentTaskEnrollment.task_id).where(
                        (StudentTaskEnrollment.student_id == Student.id) &
                        (StudentTaskEnrollment.task_set_id == task_set_id)
                    )
                )
            ))
            .where(Student.username.isnot(None))
            .group_by(Student.id, Student.username, StudentTaskSetEnrollment.enrolled_at)
            .order_by(func.max(TaskAttempt.completed_at).desc())
        )

        result = await db.execute(stmt)
        students = result.all()

        return [
            StudentInTaskSetResponse(
                username=student.username,
                started_at=student.started_at.isoformat(),
                last_activity_at=student.last_activity_at.isoformat() if student.last_activity_at else student.started_at.isoformat(),
                total_attempts=student.total_attempts,
                tasks_attempted=student.tasks_attempted
            )
            for student in students
        ]

    return await run_with_task_ids_or_empty(db, task_ids_stmt, _handler)

@router.get("/api/tasks/{task_id}", response_model=TaskResponse)
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


@router.get("/api/my_tasks")
async def list_my_tasks(current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    tasks_result = await db.execute(
        select(Parsons)
        .where(Parsons.created_by_teacher_id == current_user.id)
        .order_by(Parsons.created_at.desc())
    )
    tasks = tasks_result.scalars().all()

    if not tasks:
        return []

    task_ids = [t.id for t in tasks]

    other_sets_result = await db.execute(
        select(TaskSetItem.task_id)
        .join(TaskSet, TaskSet.id == TaskSetItem.task_set_id)
        .where(TaskSetItem.task_id.in_(task_ids), TaskSet.teacher_id != current_user.id)
        .distinct()
    )
    in_other_sets = set(other_sets_result.scalars().all())

    enrolled_sets_result = await db.execute(
        select(TaskSetItem.task_id)
        .join(TaskSet, TaskSet.id == TaskSetItem.task_set_id)
        .join(StudentTaskSetEnrollment, StudentTaskSetEnrollment.task_set_id == TaskSet.id)
        .where(TaskSetItem.task_id.in_(task_ids), TaskSet.teacher_id == current_user.id)
        .distinct()
    )
    in_enrolled_sets = set(enrolled_sets_result.scalars().all())

    non_editable = in_other_sets | in_enrolled_sets

    return [
        {
            "id": t.id,
            "title": t.title,
            "task_type": t.task_type,
            "created_at": t.created_at.isoformat(),
            "editable": t.id not in non_editable,
        }
        for t in tasks
    ]


@router.get("/api/tasks")
async def list_tasks(current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Parsons, Teacher.username, TeacherFavoriteTask.id)
        .join(Teacher, Teacher.id == Parsons.created_by_teacher_id)
        .outerjoin(
            TeacherFavoriteTask,
            (TeacherFavoriteTask.task_id == Parsons.id)
            & (TeacherFavoriteTask.teacher_id == current_user.id),
        )
        .where(Parsons.is_public)
        .order_by(Parsons.created_at.desc())
    )
    tasks = result.all()

    task_set = []
    for task, creator_username, favorite_id in tasks:
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

        task_set.append(
            {
                "id": task.id,
                "title": task.title,
                "task_instructions": instructions_text,
                "description": description_text,
                "task_type": task.task_type,
                "created_by_teacher_id": task.created_by_teacher_id,
                "creator_username": creator_username,
                "created_at": task.created_at.isoformat(),
                "is_favorite": favorite_id is not None,
            }
        )

    return task_set


@router.post("/api/tasks/{task_id}/favorite")
async def favorite_task(
    task_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    task_result = await db.execute(select(Parsons.id).where(Parsons.id == task_id, Parsons.is_public))
    if task_result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task with id {task_id} not found",
        )

    existing_result = await db.execute(
        select(TeacherFavoriteTask).where(
            TeacherFavoriteTask.teacher_id == current_user.id,
            TeacherFavoriteTask.task_id == task_id,
        )
    )
    existing = existing_result.scalar_one_or_none()
    if existing is None:
        favorite = TeacherFavoriteTask(teacher_id=current_user.id, task_id=task_id)
        db.add(favorite)
        await db.commit()

    return {"task_id": task_id, "is_favorite": True}


@router.delete("/api/tasks/{task_id}/favorite")
async def unfavorite_task(
    task_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    delete_stmt = delete(TeacherFavoriteTask).where(
        TeacherFavoriteTask.teacher_id == current_user.id,
        TeacherFavoriteTask.task_id == task_id,
    )
    result = await db.execute(delete_stmt)

    if result.rowcount == 0:
        return {"task_id": task_id, "is_favorite": False}

    await db.commit()
    return {"task_id": task_id, "is_favorite": False}


@router.post("/api/problems")
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
    custom_error_messages = request.customErrorMessages.strip() if request.customErrorMessages else None

    if not task_title or not solution_code or not description or not start_description or not tests:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="taskTitle, description, startDescription, tests and solutionCode are required",
        )

    parsons_repr = (request.parsonsRepr or "").replace("\r\n", "\n").replace("\r", "\n")
    source_for_blocks = parsons_repr if parsons_repr.strip() else solution_code

    lines = [line for line in source_for_blocks.split("\n") if line.strip()]
    if not lines:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="solutionCode must contain at least one non-empty line",
        )

    first_code_line = lines[0].strip()
    if " #" in first_code_line:
        first_code_line = first_code_line.split(" #", 1)[0].rstrip()
    if not (first_code_line.startswith("def ") or first_code_line.startswith("class ")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The first non-empty solution line must start with def or class",
        )

    import re

    header_match = re.match(r"^(def|class)\s+([A-Za-z_][A-Za-z0-9_]*)", first_code_line)
    function_name = header_match.group(2) if header_match else "custom_task"
    function_header = first_code_line
    final_title = task_title

    existing_task_stmt = select(Parsons).where(Parsons.title == final_title)
    existing_task_result = await db.execute(existing_task_stmt)
    if existing_task_result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Exercise called '{final_title}' already exists. Choose a different task name.",
        )

    given_indent_re = re.compile(r"#(\d+)given\s*")
    preplace_re = re.compile(r"#preplace\s*")
    blank_marker_re = re.compile(r"\s#blank[^#]*")

    blocks = []
    has_faded = False
    for line_index, line in enumerate(lines, start=1):
        given_match = given_indent_re.search(line)
        preplace_match = preplace_re.search(line)
        if given_match:
            indent_count = int(given_match.group(1)) * 4
        else:
            indent_count = len(line) - len(line.lstrip())

        line_without_given = given_indent_re.sub("", line)
        line_without_preplace = preplace_re.sub("", line_without_given)
        line_without_blank_markers = blank_marker_re.sub("", line_without_preplace)
        stripped_line = line_without_blank_markers.strip()
        is_faded = "!BLANK" in stripped_line
        if is_faded:
            has_faded = True

        clean_code = stripped_line.replace("!BLANK", "___")
        blocks.append(
            {
                "id": f"block_{line_index}",
                "code": clean_code,
                "indent": indent_count // 4,
                "faded": is_faded,
                "given": preplace_match is not None,
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
        task_type="Faded" if has_faded else "normal",
        code_blocks={
            "blocks": blocks,
            "function_header": function_header,
        },
        correct_solution={
            "correct_order": [block["id"] for block in blocks],
            "teacher_tests": tests,
            "solution_code": solution_code,
            "custom_error_messages": custom_error_messages,
        },
        is_public=True,
    )

    db.add(task)
    await db.flush()

    model_answer_code = (request.modelAnswerCode or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    model_answer = ModelAnswer(
        parsons_id=task.id,
        created_by_teacher_id=current_user.id,
        answer_code=model_answer_code or solution_code,
    )
    db.add(model_answer)
    await db.commit()
    await db.refresh(task)

    return {"id": task.id, "message": "Problem created"}


@router.get("/api/problems/{task_id}/editable")
async def check_task_editable(
    task_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    task_result = await db.execute(select(Parsons).where(Parsons.id == task_id))
    task = task_result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Task {task_id} not found")

    if task.created_by_teacher_id != current_user.id and not current_user.is_admin_teacher:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You don't have permission to check this task")

    editable = await is_task_editable(task_id, current_user.id, db)
    return {"task_id": task_id, "editable": editable}


@router.put("/api/problems/{task_id}")
async def update_problem(
    task_id: int,
    request: CreateProblemRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db)
):
    task_result = await db.execute(select(Parsons).where(Parsons.id == task_id))
    task = task_result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Task {task_id} not found")

    if task.created_by_teacher_id != current_user.id and not current_user.is_admin_teacher:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You don't have permission to edit this task")

    if not await is_task_editable(task_id, current_user.id, db):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This task cannot be edited because it is used in a task set with enrolled students or in another teacher's task set.",
        )

    task_title = request.taskTitle.strip()
    solution_code = request.solutionCode.replace("\r\n", "\n").replace("\r", "\n").strip()
    description = request.description.strip()
    start_description = request.startDescription.strip()
    tests = request.tests.strip()
    custom_error_messages = request.customErrorMessages.strip() if request.customErrorMessages else None

    if not task_title or not solution_code or not description or not start_description or not tests:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="taskTitle, description, startDescription, tests and solutionCode are required",
        )

    parsons_repr = (request.parsonsRepr or "").replace("\r\n", "\n").replace("\r", "\n")
    source_for_blocks = parsons_repr if parsons_repr.strip() else solution_code

    lines = [line for line in source_for_blocks.split("\n") if line.strip()]
    if not lines:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="solutionCode must contain at least one non-empty line",
        )

    first_code_line = lines[0].strip()
    if " #" in first_code_line:
        first_code_line = first_code_line.split(" #", 1)[0].rstrip()
    if not (first_code_line.startswith("def ") or first_code_line.startswith("class ")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The first non-empty solution line must start with def or class",
        )

    import re

    header_match = re.match(r"^(def|class)\s+([A-Za-z_][A-Za-z0-9_]*)", first_code_line)
    function_name = header_match.group(2) if header_match else "custom_task"
    function_header = first_code_line
    final_title = task_title

    if task.title != final_title:
        existing_task_stmt = select(Parsons).where(Parsons.title == final_title, Parsons.id != task_id)
        existing_task_result = await db.execute(existing_task_stmt)
        if existing_task_result.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Exercise called '{final_title}' already exists. Choose a different task name.",
            )

    given_indent_re = re.compile(r"#(\d+)given\s*")
    preplace_re = re.compile(r"#preplace\s*")
    blank_marker_re = re.compile(r"\s#blank[^#]*")

    blocks = []
    has_faded = False
    for line_index, line in enumerate(lines, start=1):
        given_match = given_indent_re.search(line)
        preplace_match = preplace_re.search(line)
        if given_match:
            indent_count = int(given_match.group(1)) * 4
        else:
            indent_count = len(line) - len(line.lstrip())

        line_without_given = given_indent_re.sub("", line)
        line_without_preplace = preplace_re.sub("", line_without_given)
        line_without_blank_markers = blank_marker_re.sub("", line_without_preplace)
        stripped_line = line_without_blank_markers.strip()
        is_faded = "!BLANK" in stripped_line
        if is_faded:
            has_faded = True

        clean_code = stripped_line.replace("!BLANK", "___")
        blocks.append(
            {
                "id": f"block_{line_index}",
                "code": clean_code,
                "indent": indent_count // 4,
                "faded": is_faded,
                "given": preplace_match is not None,
            }
        )

    task_instructions_payload = json.dumps(
        {
            "function_name": function_name,
            "task_instructions": description,
            "examples": "",
        }
    )

    task.title = final_title
    task.task_instructions = task_instructions_payload
    task.description = start_description
    task.task_type = "Faded" if has_faded else "normal"
    task.code_blocks = {"blocks": blocks, "function_header": function_header}
    task.correct_solution = {
        "correct_order": [block["id"] for block in blocks],
        "teacher_tests": tests,
        "solution_code": solution_code,
        "custom_error_messages": custom_error_messages,
    }

    model_answer_code = (request.modelAnswerCode or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    model_answer_result = await db.execute(select(ModelAnswer).where(ModelAnswer.parsons_id == task_id))
    model_answer = model_answer_result.scalar_one_or_none()

    if model_answer:
        model_answer.answer_code = model_answer_code or solution_code
    else:
        model_answer = ModelAnswer(
            parsons_id=task_id,
            created_by_teacher_id=current_user.id,
            answer_code=model_answer_code or solution_code,
        )
        db.add(model_answer)

    await db.commit()
    await db.refresh(task)

    return {"id": task.id, "message": "Problem updated"}

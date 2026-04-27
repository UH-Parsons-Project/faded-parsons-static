"""
Unit tests for statistic_api.py - Statistics API endpoints.
"""

import pytest
import pytest_asyncio
from datetime import datetime, timezone, timedelta
from fastapi import status
from sqlalchemy import select
from unittest.mock import patch, AsyncMock

from backend.models import (
    Student, TaskSet, Parsons, StudentTaskSetEnrollment, 
    StudentTaskEnrollment, TaskAttempt, TaskSession, EditEvent, MoveEvent, ModelAnswer
)
from backend.pydantic import StudentTaskAttemptResponse, StudentTaskStatisticsResponse
from backend.database import get_db
from backend.auth import create_access_token
from backend.main import app


def _auth(username: str) -> dict:
    """Return an Authorization header dict for the given teacher username."""
    return {"Authorization": f"Bearer {create_access_token({'sub': username})}"}


@pytest_asyncio.fixture
async def student_with_attempts(db_session, task_set, task) -> Student:
    """Create a student with task attempts for testing."""
    student = Student(username="attempt_student", email="attempt@example.com")
    student.set_password("password123")
    db_session.add(student)
    await db_session.flush()
    
    # Enroll student in task set and task
    enrollment = StudentTaskSetEnrollment(student_id=student.id, task_set_id=task_set.id)
    db_session.add(enrollment)
    await db_session.flush()
    
    task_enrollment = StudentTaskEnrollment(
        student_id=student.id,
        task_id=task.id,
        task_set_id=task_set.id,
        started_at=datetime(2026, 1, 1, 10, 0, 0)
    )
    db_session.add(task_enrollment)
    await db_session.flush()
    
    # Create task session
    session = TaskSession(
        student_task_enrollment_id=task_enrollment.id,
        entered_at=datetime(2026, 1, 1, 10, 0, 0),
        exited_at=datetime(2026, 1, 1, 10, 5, 0),
    )
    db_session.add(session)
    await db_session.flush()
    
    # Create a successful attempt
    attempt = TaskAttempt(
        student_id=student.id,
        task_id=task.id,
        student_task_enrollment_id=task_enrollment.id,
        task_session_id=session.id,
        completed_at=datetime(2026, 1, 1, 10, 5, 0),
        success=True,
        submitted_inputs={"code": "print('hello')"}
    )
    db_session.add(attempt)
    await db_session.commit()
    await db_session.refresh(student)
    
    return student


@pytest_asyncio.fixture
async def model_answer_for_task(db_session, task, test_teacher) -> ModelAnswer:
    """Create a model answer for a task."""
    model_answer = ModelAnswer(
        parsons_id=task.id,
        created_by_teacher_id=test_teacher.id,
        answer_code="print('correct solution')"
    )
    db_session.add(model_answer)
    await db_session.commit()
    await db_session.refresh(model_answer)
    return model_answer


class TestGetModelAnswerForTask:
    """Tests for _get_model_answer_for_task helper function."""

    @pytest.mark.asyncio
    async def test_get_model_answer_when_exists(self, db_session, task, model_answer_for_task):
        """Test retrieving a model answer when it exists."""
        from backend.routes.statistic.statistic_api import _get_model_answer_for_task
        
        result = await _get_model_answer_for_task(task, db_session)
        assert result == "print('correct solution')"

    async def test_get_model_answer_when_not_exists(self, db_session, task):
        """Test retrieving a model answer when it doesn't exist."""
        from backend.routes.statistic.statistic_api import _get_model_answer_for_task
        
        result = await _get_model_answer_for_task(task, db_session)
        assert result is None


class TestGetStudentAttempts:
    """Tests for GET /api/students/{student_username}/attempts endpoint."""

    async def test_get_student_attempts_success(self, client, db_session, test_teacher, 
                                                task_set, task, student_with_attempts):
        """Test successfully retrieving student attempts for a task set."""
        # Add task to task set
        from backend.models import TaskSetItem
        item = TaskSetItem(task_set_id=task_set.id, task_id=task.id)
        db_session.add(item)
        await db_session.commit()

        response = await client.get(
            f"/api/students/attempt_student/attempts?set_id={task_set.id}",
            headers=_auth(test_teacher.username)
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        assert data[0]["task_title"] == task.title

    async def test_get_student_attempts_no_attempts(self, client, db_session, test_teacher, 
                                                     task_set, task, student_session):
        """Test retrieving attempts for student with no attempts."""
        from backend.models import TaskSetItem
        item = TaskSetItem(task_set_id=task_set.id, task_id=task.id)
        db_session.add(item)
        await db_session.commit()

        response = await client.get(
            f"/api/students/student1/attempts?set_id={task_set.id}",
            headers=_auth(test_teacher.username)
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 0

    async def test_get_student_attempts_unauthorized(self, client, task_set, student_session):
        """Test that endpoint requires authentication."""
        response = await client.get(
            f"/api/students/student1/attempts?set_id={task_set.id}"
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    async def test_get_student_attempts_invalid_task_set(self, client, test_teacher):
        """Test with non-existent task set."""
        response = await client.get(
            f"/api/students/student1/attempts?set_id=9999",
            headers=_auth(test_teacher.username)
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    async def test_get_student_attempts_access_denied(self, client, db_session, 
                                                       test_teacher, task_set):
        """Test that teacher can't see attempts for task set they don't own."""
        # Create another teacher
        from backend.models import Teacher
        other_teacher = Teacher(username="otherteacher", email="other@example.com")
        other_teacher.set_password("password123")
        db_session.add(other_teacher)
        await db_session.commit()

        response = await client.get(
            f"/api/students/student1/attempts?set_id={task_set.id}",
            headers=_auth(other_teacher.username)
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN


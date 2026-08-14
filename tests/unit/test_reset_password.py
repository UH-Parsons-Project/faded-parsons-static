import pytest
import pytest_asyncio
from sqlalchemy import select
from backend.teacher_auth import create_access_token
from backend.models import Teacher, Student

def _auth(username: str) -> dict:
    """Return an Authorization header dict for the given username."""
    return {"Authorization": f"Bearer {create_access_token({'sub': username})}"}

@pytest_asyncio.fixture
async def admin_teacher(db_session) -> Teacher:
    """Create an admin teacher user."""
    teacher = Teacher(
        username="adminteacher",
        email="admin@example.com",
        is_active=True,
        is_admin_teacher=True,
    )
    teacher.set_password("adminpassword123")

    db_session.add(teacher)
    await db_session.commit()
    await db_session.refresh(teacher)

    return teacher

@pytest_asyncio.fixture
async def target_teacher(db_session) -> Teacher:
    """Create a target teacher user."""
    teacher = Teacher(
        username="targetteacher",
        email="targetteacher@example.com",
        is_active=True,
        is_admin_teacher=False,
    )
    teacher.set_password("oldteacherpassword")

    db_session.add(teacher)
    await db_session.commit()
    await db_session.refresh(teacher)

    return teacher

@pytest_asyncio.fixture
async def target_student(db_session) -> Student:
    """Create a target student user."""
    student = Student(
        username="targetstudent",
        email="targetstudent@example.com",
        is_active=True,
    )
    student.set_password("oldstudentpassword")

    db_session.add(student)
    await db_session.commit()
    await db_session.refresh(student)

    return student

@pytest.mark.asyncio
async def test_admin_can_reset_teacher_password(client, db_session, admin_teacher, target_teacher):
    target_id = target_teacher.id
    r = await client.post(
        f"/api/admin/users/teacher/{target_id}/reset-password",
        headers=_auth(admin_teacher.username),
        json={"admin_password": "adminpassword123"}
    )
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "success"
    assert "new_password" in data
    assert len(data["new_password"]) == 15

    # Verify target teacher can verify with new password and not old password
    db_session.expire_all()
    stmt = select(Teacher).where(Teacher.id == target_id)
    res = await db_session.execute(stmt)
    updated_teacher = res.scalar_one_or_none()
    assert updated_teacher.verify_password(data["new_password"]) is True
    assert updated_teacher.verify_password("oldteacherpassword") is False

@pytest.mark.asyncio
async def test_admin_can_reset_student_password(client, db_session, admin_teacher, target_student):
    target_id = target_student.id
    r = await client.post(
        f"/api/admin/users/student/{target_id}/reset-password",
        headers=_auth(admin_teacher.username),
        json={"admin_password": "adminpassword123"}
    )
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "success"
    assert "new_password" in data
    assert len(data["new_password"]) == 15

    # Verify target student can verify with new password and not old password
    db_session.expire_all()
    stmt = select(Student).where(Student.id == target_id)
    res = await db_session.execute(stmt)
    updated_student = res.scalar_one_or_none()
    assert updated_student.verify_password(data["new_password"]) is True
    assert updated_student.verify_password("oldstudentpassword") is False

@pytest.mark.asyncio
async def test_reset_password_fails_with_incorrect_admin_password(client, admin_teacher, target_teacher):
    r = await client.post(
        f"/api/admin/users/teacher/{target_teacher.id}/reset-password",
        headers=_auth(admin_teacher.username),
        json={"admin_password": "wrongpassword"}
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "Incorrect admin password"

@pytest.mark.asyncio
async def test_reset_password_fails_for_non_admin(client, target_teacher, target_student):
    r = await client.post(
        f"/api/admin/users/student/{target_student.id}/reset-password",
        headers=_auth(target_teacher.username),
        json={"admin_password": "oldteacherpassword"}
    )
    assert r.status_code == 403

@pytest.mark.asyncio
async def test_reset_password_fails_for_dummy_user(client, admin_teacher):
    r = await client.post(
        "/api/admin/users/teacher/999999/reset-password",
        headers=_auth(admin_teacher.username),
        json={"admin_password": "adminpassword123"}
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "Cannot reset password for deleted_user"

@pytest.mark.asyncio
async def test_reset_password_nonexistent_user(client, admin_teacher):
    r = await client.post(
        "/api/admin/users/teacher/888888/reset-password",
        headers=_auth(admin_teacher.username),
        json={"admin_password": "adminpassword123"}
    )
    assert r.status_code == 404

@pytest.mark.asyncio
async def test_reset_password_fails_for_other_admin(client, db_session, admin_teacher):
    other_admin = Teacher(
        username="otheradmin",
        email="otheradmin@example.com",
        is_active=True,
        is_admin_teacher=True,
    )
    other_admin.set_password("otheradminpass")
    db_session.add(other_admin)
    await db_session.commit()
    await db_session.refresh(other_admin)

    r = await client.post(
        f"/api/admin/users/teacher/{other_admin.id}/reset-password",
        headers=_auth(admin_teacher.username),
        json={"admin_password": "adminpassword123"}
    )
    assert r.status_code == 403
    assert r.json()["detail"] == "Cannot reset password for another admin"


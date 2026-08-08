import pytest
import pytest_asyncio
from sqlalchemy import select
from backend.teacher_auth import create_access_token
from backend.models import Teacher

def _auth(username: str) -> dict:
    """Return an Authorization header dict for the given teacher username."""
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
    """Create a teacher user to be promoted."""
    teacher = Teacher(
        username="targetteacher",
        email="target@example.com",
        is_active=True,
        is_admin_teacher=False,
    )
    teacher.set_password("password123")

    db_session.add(teacher)
    await db_session.commit()
    await db_session.refresh(teacher)

    return teacher

@pytest.mark.asyncio
async def test_admin_can_promote_teacher(client, db_session, admin_teacher, target_teacher):
    target_teacher_id = target_teacher.id
    # Promote the target teacher
    r = await client.post(
        f"/api/admin/users/teacher/{target_teacher_id}/make-admin",
        headers={**_auth(admin_teacher.username), "X-Admin-Password": "adminpassword123"}
    )
    assert r.status_code == 200
    assert r.json() == {"status": "success", "message": "Teacher promoted to admin"}

    # Refresh and verify
    db_session.expire_all()
    stmt = select(Teacher).where(Teacher.id == target_teacher_id)
    res = await db_session.execute(stmt)
    promoted = res.scalar_one_or_none()
    assert promoted is not None
    assert promoted.is_admin_teacher is True

@pytest.mark.asyncio
async def test_promote_fails_with_incorrect_password(client, db_session, admin_teacher, target_teacher):
    target_teacher_id = target_teacher.id
    r = await client.post(
        f"/api/admin/users/teacher/{target_teacher_id}/make-admin",
        headers={**_auth(admin_teacher.username), "X-Admin-Password": "wrongpassword"}
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "Incorrect admin password"

    # Verify not promoted
    db_session.expire_all()
    stmt = select(Teacher).where(Teacher.id == target_teacher_id)
    res = await db_session.execute(stmt)
    not_promoted = res.scalar_one_or_none()
    assert not_promoted is not None
    assert not_promoted.is_admin_teacher is False

@pytest.mark.asyncio
async def test_promote_fails_with_missing_password(client, db_session, admin_teacher, target_teacher):
    r = await client.post(
        f"/api/admin/users/teacher/{target_teacher.id}/make-admin",
        headers=_auth(admin_teacher.username)
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "Incorrect admin password"

@pytest.mark.asyncio
async def test_promote_fails_when_already_admin(client, db_session, admin_teacher, target_teacher):
    # Make them admin first
    target_teacher.is_admin_teacher = True
    await db_session.commit()

    r = await client.post(
        f"/api/admin/users/teacher/{target_teacher.id}/make-admin",
        headers={**_auth(admin_teacher.username), "X-Admin-Password": "adminpassword123"}
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "Teacher is already an admin"

@pytest.mark.asyncio
async def test_non_admin_cannot_promote(client, db_session, target_teacher):
    # Try to promote oneself without admin rights
    r = await client.post(
        f"/api/admin/users/teacher/{target_teacher.id}/make-admin",
        headers={**_auth(target_teacher.username), "X-Admin-Password": "password123"}
    )
    assert r.status_code == 403

@pytest.mark.asyncio
async def test_promote_nonexistent_teacher(client, admin_teacher):
    r = await client.post(
        "/api/admin/users/teacher/99999/make-admin",
        headers={**_auth(admin_teacher.username), "X-Admin-Password": "adminpassword123"}
    )
    assert r.status_code == 404
    assert r.json()["detail"] == "Teacher not found"

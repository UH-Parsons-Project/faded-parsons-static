import pytest
from sqlalchemy import select
from backend.teacher_auth import create_access_token
from backend.models import Teacher, Student

def _auth(username: str) -> dict:
    """Return an Authorization header dict for the given teacher username."""
    return {"Authorization": f"Bearer {create_access_token({'sub': username})}"}

@pytest.fixture
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

@pytest.fixture
async def test_student(db_session) -> Student:
    """Create a test student user."""
    student = Student(
        username="teststudent",
        email="student@example.com",
        is_active=True
    )
    student.set_password("studentpassword123")

    db_session.add(student)
    await db_session.commit()
    await db_session.refresh(student)

    return student

@pytest.mark.asyncio
async def test_all_users_page_unauthenticated_redirects(client):
    """Test that unauthenticated requests to /all-users redirect to root."""
    r = await client.get("/all-users", follow_redirects=False)
    assert r.status_code == 303
    assert r.headers["location"] == "/"

@pytest.mark.asyncio
async def test_all_users_page_non_admin_redirects(client, test_teacher):
    """Test that non-admin teachers requesting /all-users redirect to root."""
    r = await client.get("/all-users", headers=_auth(test_teacher.username), follow_redirects=False)
    assert r.status_code == 303
    assert r.headers["location"] == "/"

@pytest.mark.asyncio
async def test_all_users_page_admin_returns_200(client, admin_teacher):
    """Test that admin teachers can open /all-users page."""
    r = await client.get("/all-users", headers=_auth(admin_teacher.username))
    assert r.status_code == 200

@pytest.mark.asyncio
async def test_api_users_unauthenticated_returns_401(client):
    """Test that unauthenticated requests to the API users endpoint get 401."""
    r = await client.get("/api/admin/users")
    assert r.status_code == 401

@pytest.mark.asyncio
async def test_api_users_non_admin_returns_403(client, test_teacher):
    """Test that non-admin teachers get 403 when requesting the users list API."""
    r = await client.get("/api/admin/users", headers=_auth(test_teacher.username))
    assert r.status_code == 403

@pytest.mark.asyncio
async def test_api_users_admin_returns_list_of_users(client, admin_teacher, test_teacher, test_student):
    """Test that admin teachers can get a list of all users from the API."""
    r = await client.get("/api/admin/users", headers=_auth(admin_teacher.username))
    assert r.status_code == 200
    
    users = r.json()
    assert len(users) >= 3 # at least admin_teacher, test_teacher, test_student
    
    roles = [u["role"] for u in users]
    usernames = [u["username"] for u in users]
    
    assert "teacher" in roles
    assert "student" in roles
    assert admin_teacher.username in usernames
    assert test_teacher.username in usernames
    assert test_student.username in usernames

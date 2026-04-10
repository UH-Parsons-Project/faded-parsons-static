"""
Database seeding - creates initial data for development.
"""

import os
from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from .database import async_session
from .models import Parsons, TaskSet, TaskSetItem, Teacher, RegistrationToken, Student, StudentTaskSetEnrollment, TaskAttempt, TaskStart
from .migrate_tasks import migrate_tasks
from backend.utils import hash_token


async def seed_db():
    """
    Create initial test teacher user and migrate tasks if they don't exist.
    Called on application startup.
    """
    async with async_session() as session:
        # Check if test teacher already exists
        result = await session.execute(
            select(Teacher).where(Teacher.username == "mattiruotsalainen")
        )
        existing_teacher = result.scalar_one_or_none()
        teacher_to_use = None

        if existing_teacher is None:
            # Create default test teacher
            test = Teacher(
                username="mattiruotsalainen",
                email="matti.ruotsalainen@example.com",
                has_data_access=True
            )
            test.set_password("test1234")  # Change in production!

            session.add(test)
            try:
                await session.commit()
                await session.refresh(test)
                teacher_to_use = test
                print("Created default test teacher (username: mattiruotsalainen, password: test1234)")
            except IntegrityError:
                # User was created by another instance in a race condition
                await session.rollback()
                print("Test teacher already exists (created by another instance), skipping seed")
        else:
            teacher_to_use = existing_teacher
            print("Test teacher already exists, skipping seed")

        # Create a registration token for testing if TEACHER_REGISTRATION_TOKEN is set
        registration_token = os.getenv("TEACHER_REGISTRATION_TOKEN")
        if registration_token and teacher_to_use:
            token_hash = hash_token(registration_token)
            reg_token = RegistrationToken(
                token_hash=token_hash,
                created_by_admin_id=teacher_to_use.id,
            )
            session.add(reg_token)
            try:
                await session.commit()
                print("Created registration token from TEACHER_REGISTRATION_TOKEN environment variable")
            except IntegrityError:
                await session.rollback()
                print("Registration token already exists, skipping seed")

    # Migrate tasks from parsons_probs/ directory
    print("\nMigrating tasks from parsons_probs/...")
    await migrate_tasks()

    # Create a default task set for the test teacher
    async with async_session() as session:
        teacher_result = await session.execute(
            select(Teacher).where(Teacher.username == "mattiruotsalainen")
        )
        test_teacher = teacher_result.scalar_one_or_none()

        if test_teacher is None:
            print("Test teacher not found, skipping task set seed")
            return

        list_result = await session.execute(
            select(TaskSet).where(TaskSet.unique_link_code == "starter-list")
        )
        existing_list = list_result.scalar_one_or_none()

        if existing_list is None:
            default_list = TaskSet(
                teacher_id=test_teacher.id,
                title="Starter List",
                unique_link_code="starter-list",
                teacher_description="Template starter list containing 2 foundational exercises for beginners. Use this as a reference for creating your own exercise collections. Students can attempt each exercise multiple times with instant feedback. View student progress and statistics through the dashboard. Part of Helsinki University's Parsons Code Lab project.",
                student_description="A beginner-friendly collection of foundational programming exercises designed to help you learn core concepts. This starter set includes two carefully selected tasks that progressively build your understanding. Each exercise includes clear instructions and starter code to help you get started. You can run and test your code as many times as needed until you're ready to submit.",
            )
            session.add(default_list)
            try:
                await session.commit()
                print("Created default task set (unique_link_code: starter-list)")
            except IntegrityError:
                await session.rollback()
                print("Default task set already exists (race condition), skipping seed")
        else:
            print("Default task set already exists, skipping seed")

        # Ensure starter list has two exercises
        starter_list_result = await session.execute(
            select(TaskSet).where(TaskSet.unique_link_code == "starter-list")
        )
        starter_list = starter_list_result.scalar_one_or_none()

        if starter_list is None:
            print("Starter task set not found, skipping exercise assignment")
            return

        tasks_result = await session.execute(
            select(Parsons).order_by(Parsons.id).limit(2)
        )
        starter_tasks = tasks_result.scalars().all()

        if len(starter_tasks) < 2:
            print("Not enough tasks available to seed two exercises")
            return

        existing_items_result = await session.execute(
            select(TaskSetItem).where(TaskSetItem.task_set_id == starter_list.id)
        )
        existing_items = existing_items_result.scalars().all()
        existing_task_ids = {item.task_id for item in existing_items}

        new_items = []
        for task in starter_tasks:
            if task.id not in existing_task_ids:
                new_items.append(
                    TaskSetItem(task_set_id=starter_list.id, task_id=task.id)
                )

        if new_items:
            session.add_all(new_items)
            try:
                await session.commit()
                print(f"Added {len(new_items)} exercises to starter task set")
            except IntegrityError:
                await session.rollback()
                print("Could not add starter exercises (race condition), skipping")
        else:
            print("Starter task set already has the seeded exercises")


async def seed_mock_activity():
    """
    Create mock activity data for the last 7 days (students and teachers).
    Useful for testing the admin dashboard statistics.
    Call this manually after seed_db() for development.
    """
    async with async_session() as session:
        now = datetime.now(timezone.utc)

        # Create multiple teachers spread over the last 7 days
        print("\n=== Creating mock teachers ===")
        new_teachers = []
        teacher_counts = [2, 3, 2, 4, 1, 2, 3]  # teachers per day for 7 days

        for day_offset in range(7):
            day_created_at = now - timedelta(days=day_offset)
            num_teachers = teacher_counts[day_offset]

            for j in range(num_teachers):
                teacher = Teacher(
                    username=f"teacher_mock_{day_offset}_{j}",
                    email=f"teacher_mock_{day_offset}_{j}@example.com"
                )
                teacher.set_password("password123")
                teacher.created_at = day_created_at - timedelta(hours=j)
                new_teachers.append(teacher)

        session.add_all(new_teachers)
        await session.commit()
        print(f"Created {len(new_teachers)} mock teachers")

        # Get first teacher (from seed) and a task set
        result = await session.execute(select(Teacher).where(Teacher.username == "mattiruotsalainen"))
        admin_teacher = result.scalar_one_or_none()

        if not admin_teacher:
            print("Could not find admin teacher, skipping mock student data")
            return

        result = await session.execute(select(TaskSet).limit(1))
        task_set = result.scalar_one_or_none()

        if not task_set:
            print("Could not find task set, skipping mock student data")
            return

        # Get tasks from the task set
        result = await session.execute(
            select(Parsons).join(TaskSetItem).where(TaskSetItem.task_set_id == task_set.id)
        )
        tasks = result.scalars().all()

        if not tasks:
            print("No tasks in task set, skipping mock student data")
            return

        # Create students and activity spread across last 7 days
        print("=== Creating mock student activity ===")
        students_created = 0
        attempts_created = 0

        activity_counts = {0: 8, 1: 12, 2: 6, 3: 15, 4: 9, 5: 11, 6: 13}  # per day

        for day_offset in range(7):
            day_activity_count = activity_counts.get(day_offset, 10)
            activity_date = now - timedelta(days=day_offset)

            for j in range(day_activity_count):
                # Create student
                student = Student(
                    username=f"student_mock_{day_offset}_{j}",
                    email=f"student_mock_{day_offset}_{j}@example.com",
                )
                student.set_password("password123")
                student.started_at = activity_date - timedelta(hours=j * 2)
                session.add(student)
                await session.flush()  # Get the student ID
                students_created += 1

                # Enroll student in task set
                enrollment = StudentTaskSetEnrollment(
                    student_id=student.id,
                    task_set_id=task_set.id,
                    enrolled_at=activity_date - timedelta(hours=j * 2),
                )
                session.add(enrollment)
                await session.flush()

                # Create task start
                task = tasks[j % len(tasks)]
                task_start = TaskStart(
                    student_id=student.id,
                    task_id=task.id,
                    started_at=activity_date - timedelta(hours=j * 2)
                )
                session.add(task_start)
                await session.flush()

                # Create task attempt (submission)
                attempt = TaskAttempt(
                    student_id=student.id,
                    task_id=task.id,
                    task_start_id=task_start.id,
                    completed_at=activity_date - timedelta(hours=j * 2, minutes=30),
                    success=j % 3 != 0,  # 2/3 success rate
                    submitted_order={},
                    submitted_inputs={"code": "mock_submission"}
                )
                session.add(attempt)
                attempts_created += 1

        await session.commit()
        print(f"Created {students_created} mock students with {attempts_created} task attempts")
        print("Mock activity data ready for dashboard viewing!")

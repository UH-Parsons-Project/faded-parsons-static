#!/usr/bin/env python3
"""
Seed realistic box-plot demo data.

Creates 150 demo students with varied timing so every metric (TFF, TFS,
thinking time, moves) shows a proper box with IQR, whiskers, and outliers
on both ends.  Includes extreme outliers (2 h success, 95 moves, etc.) to
stress-test axis scaling and layout.

Usage (from project root while web is running in different terminal):
    docker compose exec web python3 -m backend.seed_boxplot_demo
"""

import asyncio
import random as _random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import backend.config as config
from backend.database import async_session
from backend.models import (
    MoveEvent,
    Parsons,
    Student,
    StudentTaskEnrollment,
    StudentTaskSetEnrollment,
    TaskAttempt,
    TaskSession,
    TaskSet,
    TaskSetItem,
)
from sqlalchemy import select

PREFIX = "demo_bp_"

# (thinking_s, first_fail_s, first_success_s, n_moves)
# None = event did not occur for this student.
#
# 150 students generated with a fixed seed for reproducibility.
# Designed to produce:
#   TFF  – bulk 50–110 s → fence ≈15 s / 145 s
#           LOW outliers : 2 s, 4 s, 6 s
#           HIGH outliers: 400 s, 700 s, 1 000 s  (+ 200 s from extreme-TFS student)
#   TFS  – bulk 80–550 s, no forced low outliers
#           HIGH outliers: 3 600 s (1 h), 7 200 s (2 h)
#   Think– bulk 5–75 s, no forced outliers
#   Moves– bulk 8–30 → fence ≈5 / 33
#           LOW outliers : 2, 3, 4
#           HIGH outliers: 40, 55, 65, 68, 80, 85, 95
_rng = _random.Random(42)

STUDENT_DATA: list[tuple] = []

# 45 fast students
for _ in range(45):
    STUDENT_DATA.append((
        _rng.randint(5,  20),   # thinking
        _rng.randint(50, 70),   # first fail
        _rng.randint(80, 200),  # first success
        _rng.randint(13, 18),   # moves
    ))

# 70 normal students
for _ in range(70):
    STUDENT_DATA.append((
        _rng.randint(15, 45),   # thinking
        _rng.randint(55, 90),   # first fail
        _rng.randint(150, 350), # first success
        _rng.randint(16, 24),   # moves
    ))

# 20 slow students
for _ in range(20):
    STUDENT_DATA.append((
        _rng.randint(40, 75),   # thinking
        _rng.randint(80, 110),  # first fail
        _rng.randint(300, 550), # first success
        _rng.randint(21, 30),   # moves
    ))

# 3 no-fail students (solved it on the first attempt)
for _ in range(3):
    STUDENT_DATA.append((
        _rng.randint(5, 15),    # thinking
        None,                   # no fail
        _rng.randint(50, 120),  # first success
        _rng.randint(8, 13),    # moves
    ))

# Low-end outliers – TFF outlier (very fast fail) + Moves outlier (barely moved)
STUDENT_DATA += [
    (4,   2,   45,   2),
    (6,   4,   60,   3),
    (7,   6,   70,   4),
]

# High TFF outliers – very long time before giving up (never succeeded)
STUDENT_DATA += [
    (55,  400, None, 40),
    (70,  700, None, 55),
    (80, 1000, None, 65),
]

# Extreme TFS outliers – 1 h and 2 h to finally succeed
STUDENT_DATA += [
    (30, 120, 3600,  68),   # 1 h to succeed, many moves
    (45, 200, 7200,  85),   # 2 h to succeed, many moves
]

# Extreme Moves outliers – 80 and 95 moves, moderately slow otherwise
STUDENT_DATA += [
    (60, 150,  480, 80),
    (75, 180,  580, 95),
]

# Gave up after a normal-looking fail (no success)
STUDENT_DATA += [
    (25,  90, None, 22),
    (35, 110, None, 28),
]


async def main() -> None:
    if not config.DEVELOPMENT_MODE:
        print("✗  DEVELOPMENT_MODE must be true. Aborted.")
        sys.exit(1)

    async with async_session() as db:
        # ── locate task set & first task ───────────────────────────
        ts_result = await db.execute(
            select(TaskSet).where(TaskSet.unique_link_code == "starter-list")
        )
        task_set = ts_result.scalar_one_or_none()
        if not task_set:
            print("✗  'starter-list' task set not found. Start the app first so it seeds.")
            sys.exit(1)

        task_result = await db.execute(
            select(Parsons)
            .join(TaskSetItem, TaskSetItem.task_id == Parsons.id)
            .where(TaskSetItem.task_set_id == task_set.id)
            .order_by(Parsons.id)
            .limit(1)
        )
        task = task_result.scalar_one_or_none()
        if not task:
            print("✗  No tasks in starter-list task set.")
            sys.exit(1)

        print(f"Task : '{task.title}' (id={task.id})")
        print(f"Set  : '{task_set.title}' (code={task_set.unique_link_code}, id={task_set.id})")

        # ── remove any previous demo students ──────────────────────
        prev = (await db.execute(
            select(Student).where(Student.username.like(f"{PREFIX}%"))
        )).scalars().all()
        if prev:
            for s in prev:
                await db.delete(s)
            await db.commit()
            print(f"Removed {len(prev)} previous demo students")

        # ── create students ────────────────────────────────────────
        now = datetime.now(timezone.utc)
        base_time = now - timedelta(hours=3)  # activity 3 h ago

        created = 0
        for i, (thinking_s, fail_s, success_s, n_moves) in enumerate(STUDENT_DATA):
            started_at = base_time + timedelta(minutes=i * 2)

            last_s = max(v for v in (fail_s, success_s, thinking_s) if v is not None)
            session_end = started_at + timedelta(seconds=last_s + 120)

            # Student account
            student = Student(
                username=f"{PREFIX}{i:03d}",
                email=f"{PREFIX}{i:02d}@demo.local",
            )
            student.set_password("demo1234")
            student.started_at = started_at
            db.add(student)
            await db.flush()

            # Task-set enrollment
            db.add(StudentTaskSetEnrollment(
                student_id=student.id,
                task_set_id=task_set.id,
                enrolled_at=started_at,
            ))

            # Task enrollment (started_at drives thinking-time calc)
            enrollment = StudentTaskEnrollment(
                student_id=student.id,
                task_id=task.id,
                task_set_id=task_set.id,
                started_at=started_at,
            )
            db.add(enrollment)
            await db.flush()

            # Single session covering all activity
            db.add(TaskSession(
                student_task_enrollment_id=enrollment.id,
                entered_at=started_at,
                exited_at=session_end,
                exit_reason="submit",
            ))
            await db.flush()

            # Failed attempt (comes before success)
            fail_attempt = None
            if fail_s is not None:
                fail_attempt = TaskAttempt(
                    student_id=student.id,
                    task_id=task.id,
                    student_task_enrollment_id=enrollment.id,
                    completed_at=started_at + timedelta(seconds=fail_s),
                    success=False,
                    submitted_inputs=None,
                )
                db.add(fail_attempt)
                await db.flush()

            # Successful attempt
            if success_s is not None:
                db.add(TaskAttempt(
                    student_id=student.id,
                    task_id=task.id,
                    student_task_enrollment_id=enrollment.id,
                    completed_at=started_at + timedelta(seconds=success_s),
                    success=True,
                    submitted_inputs=None,
                ))
                await db.flush()

            # Move events – attach to first attempt, spread over activity window
            anchor = fail_attempt or (await db.execute(
                select(TaskAttempt)
                .where(TaskAttempt.student_task_enrollment_id == enrollment.id)
                .order_by(TaskAttempt.completed_at)
                .limit(1)
            )).scalar_one_or_none()

            if anchor and n_moves > 0:
                move_span = last_s - thinking_s
                for m in range(n_moves):
                    offset_s = thinking_s + (move_span * m / max(n_moves - 1, 1))
                    db.add(MoveEvent(
                        attempt_id=anchor.id,
                        block_id=f"block_{m % 5}",
                        from_container="source",
                        to_container="answer",
                        from_index=m % 4,
                        to_index=m % 4,
                        from_indent=0,
                        to_indent=0,
                        event_time=started_at + timedelta(seconds=offset_s),
                    ))

            created += 1

        await db.commit()

    print(f"\n✓  Created {created} demo students")
    print(f"\nView stats at:")
    print(f"  /task-statistics?id={task.id}&task_set={task_set.unique_link_code}&set_id={task_set.id}")


if __name__ == "__main__":
    asyncio.run(main())

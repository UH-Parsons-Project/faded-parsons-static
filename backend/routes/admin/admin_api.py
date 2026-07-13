from datetime import datetime, timedelta, timezone

TOKEN_EXPIRY_DAYS = 7
TOKEN_MIN_LENGTH = 10
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func, or_, delete
from sqlalchemy.ext.asyncio import AsyncSession

from ...auth import CurrentUser
from ...database import get_db
from ...models import RegistrationToken, TaskSet, Teacher, Student, TaskAttempt, StudentTaskSetEnrollment, TaskSetItem, Parsons, ModelAnswer
from ...pydantic import (
    TaskSetResponse,
    CreateRegistrationTokenRequest,
    RegistrationTokenResponse,
    RegistrationTokenListItem,
    UserActivityResponse,
    UserActivityStats,
    DailyActiveUser,
    MonthlyActiveUser,
    UserListItem,
)
from backend.utils import generate_token, hash_token, cleanup_old_registration_tokens
import backend.config as config
from ..utils.commons import build_taskset_response_list

BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent

router = APIRouter()


@router.post("/api/admin/registration-tokens", response_model=RegistrationTokenResponse)
async def create_registration_token(
	request: CreateRegistrationTokenRequest,
	current_user: CurrentUser,
	db: AsyncSession = Depends(get_db),
):
	"""Create a new registration token for teachers. Admin only."""
	# Check admin access
	if not current_user.is_admin_teacher:
		raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)

	await cleanup_old_registration_tokens(db)
	await db.commit()

	# Get or generate token
	plain_token = request.token.strip() if request.token else None

	if not plain_token:
		plain_token = generate_token(length=32)
	elif len(plain_token) < TOKEN_MIN_LENGTH:
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail=f"Token must be at least {TOKEN_MIN_LENGTH} characters long",
		)

	# Hash the token
	token_hash = hash_token(plain_token)

	# Create token in database
	reg_token = RegistrationToken(
		token_hash=token_hash,
		created_by_admin_id=current_user.id,
		expires_at=datetime.now(timezone.utc) + timedelta(days=TOKEN_EXPIRY_DAYS),
	)

	db.add(reg_token)
	await db.commit()
	await db.refresh(reg_token)

	# Return token only once - this is the only time the plain token is shown
	return RegistrationTokenResponse(
		id=reg_token.id,
		token=plain_token,
		created_at=reg_token.created_at.isoformat(),
		expires_at=reg_token.expires_at.isoformat(),
	)


@router.get("/api/admin/registration-tokens", response_model=list[RegistrationTokenListItem])
async def list_registration_tokens(
	current_user: CurrentUser,
	db: AsyncSession = Depends(get_db),
):
	"""List all registration tokens. Admin only."""
	# Check admin access
	if not current_user.is_admin_teacher:
		raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)

	await cleanup_old_registration_tokens(db)
	await db.commit()

	stmt = select(RegistrationToken).order_by(RegistrationToken.created_at.desc())
	result = await db.execute(stmt)
	tokens = result.scalars().all()

	return [
		RegistrationTokenListItem(
			id=token.id,
			created_at=token.created_at.isoformat(),
			expires_at=token.expires_at.isoformat(),
			created_by_admin_id=token.created_by_admin_id,
		)
		for token in tokens
	]


@router.delete("/api/admin/registration-tokens/{token_id}")
async def delete_registration_token(
	token_id: int,
	current_user: CurrentUser,
	db: AsyncSession = Depends(get_db),
):
	"""Delete/revoke a registration token. Admin only."""
	# Check admin access
	if not current_user.is_admin_teacher:
		raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)

	await cleanup_old_registration_tokens(db)
	await db.commit()

	stmt = select(RegistrationToken).where(RegistrationToken.id == token_id)
	result = await db.execute(stmt)
	token = result.scalar_one_or_none()

	if not token:
		raise HTTPException(
			status_code=status.HTTP_404_NOT_FOUND,
			detail="Token not found",
		)

	await db.delete(token)
	await db.commit()

	return {"status": "success", "message": "Token deleted"}


@router.get("/api/admin/statistics/user-activity", response_model=UserActivityResponse)
async def get_user_activity_statistics(
	current_user: CurrentUser,
	db: AsyncSession = Depends(get_db),
):
	"""Get user activity statistics for students and teachers. Admin only."""
	# Check admin access via data access flag
	if not current_user.is_admin_teacher:
		raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)

	# Helper function to calculate stats
	async def calc_stats(table, timestamp_column, user_id_column):
		"""Calculate activity statistics for a user group."""
		# Get registered total
		registered_stmt = select(func.count(table.id))
		registered_result = await db.execute(registered_stmt)
		registered_total = registered_result.scalar() or 0

		# Get daily breakdown for last 7 days
		now = datetime.now(timezone.utc)
		seven_days_ago = now - timedelta(days=7)

		day_func = func.date(timestamp_column)
		daily_stmt = select(
			day_func.label('day'),
			func.count(func.distinct(user_id_column)).label('count')
		).where(
			timestamp_column >= seven_days_ago
		).group_by(
			day_func
		).order_by(
			day_func.desc()
		)

		daily_result = await db.execute(daily_stmt)
		daily_rows = daily_result.all()
		daily_breakdown = [
			DailyActiveUser(
				date=str(row[0]),
				active_users=row[1]
			)
			for row in daily_rows
		]

		# Get monthly breakdown for last 6 months
		six_months_ago = now - timedelta(days=180)

		month_trunc = func.date_trunc('month', timestamp_column)
		monthly_stmt = select(
			month_trunc.label('month'),
			func.count(func.distinct(user_id_column)).label('count')
		).where(
			timestamp_column >= six_months_ago
		).group_by(
			month_trunc
		).order_by(
			month_trunc.desc()
		)

		monthly_result = await db.execute(monthly_stmt)
		monthly_rows = monthly_result.all()
		monthly_breakdown = [
			MonthlyActiveUser(
				month=row[0].strftime('%Y-%m') if row[0] else '',
				active_users=row[1]
			)
			for row in monthly_rows
		]

		# Calculate monthly average
		monthly_average = sum(m.active_users for m in monthly_breakdown) / len(monthly_breakdown) if monthly_breakdown else 0

		return UserActivityStats(
			registered_total=registered_total,
			monthly_average=round(monthly_average, 1),
			daily_breakdown_last_7_days=daily_breakdown,
			monthly_breakdown=monthly_breakdown,
		)

	# Calculate student stats
	student_stats = await calc_stats(
		Student,
		TaskAttempt.completed_at,
		TaskAttempt.student_id
	)

	# Calculate teacher stats using teacher registration (when teachers are created)
	# Get registered teachers (all teachers)
	teacher_registered_stmt = select(func.count(Teacher.id))
	teacher_registered_result = await db.execute(teacher_registered_stmt)
	teacher_registered_total = teacher_registered_result.scalar() or 0

	# Get daily breakdown of active teachers (by registration date)
	now = datetime.now(timezone.utc)
	seven_days_ago = now - timedelta(days=7)

	teacher_day_func = func.date(Teacher.created_at)
	teacher_daily_stmt = select(
		teacher_day_func.label('day'),
		func.count(func.distinct(Teacher.id)).label('count')
	).where(
		Teacher.created_at >= seven_days_ago
	).group_by(
		teacher_day_func
	).order_by(
		teacher_day_func.desc()
	)

	teacher_daily_result = await db.execute(teacher_daily_stmt)
	teacher_daily_rows = teacher_daily_result.all()
	teacher_daily_breakdown = [
		DailyActiveUser(
			date=str(row[0]),
			active_users=row[1]
		)
		for row in teacher_daily_rows
	]

	# Get monthly breakdown of active teachers
	six_months_ago = now - timedelta(days=180)

	teacher_month_trunc = func.date_trunc('month', Teacher.created_at)
	teacher_monthly_stmt = select(
		teacher_month_trunc.label('month'),
		func.count(func.distinct(Teacher.id)).label('count')
	).where(
		Teacher.created_at >= six_months_ago
	).group_by(
		teacher_month_trunc
	).order_by(
		teacher_month_trunc.desc()
	)

	teacher_monthly_result = await db.execute(teacher_monthly_stmt)
	teacher_monthly_rows = teacher_monthly_result.all()
	teacher_monthly_breakdown = [
		MonthlyActiveUser(
			month=row[0].strftime('%Y-%m') if row[0] else '',
			active_users=row[1]
		)
		for row in teacher_monthly_rows
	]

	# Calculate teacher monthly average
	teacher_monthly_average = sum(m.active_users for m in teacher_monthly_breakdown) / len(teacher_monthly_breakdown) if teacher_monthly_breakdown else 0

	teacher_stats = UserActivityStats(
		registered_total=teacher_registered_total,
		monthly_average=round(teacher_monthly_average, 1),
		daily_breakdown_last_7_days=teacher_daily_breakdown,
		monthly_breakdown=teacher_monthly_breakdown,
	)

	return UserActivityResponse(
		students=student_stats,
		teachers=teacher_stats,
	)



@router.get("/api/all-tasksets", response_model=list[TaskSetResponse])
async def list_all_taskset(current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
	"""List all task sets from all teachers if the user has data access."""
	if not current_user.is_admin_teacher:
		raise HTTPException(
			status_code=status.HTTP_403_FORBIDDEN,
			detail="You do not have permission to access this resource.",
		)

	stmt = (
		select(
			TaskSet,
			Teacher.username,
			func.count(func.distinct(StudentTaskSetEnrollment.student_id)).label("student_count"),
			func.count(func.distinct(TaskSetItem.id)).label("task_count"),
		)
		.join(Teacher, Teacher.id == TaskSet.teacher_id)
		.outerjoin(StudentTaskSetEnrollment, StudentTaskSetEnrollment.task_set_id == TaskSet.id)
		.outerjoin(TaskSetItem, TaskSetItem.task_set_id == TaskSet.id)
		.group_by(TaskSet.id, Teacher.username)
		.order_by(TaskSet.created_at.desc())
	)
	result = await db.execute(stmt)
	my_sets = result.all()

	return build_taskset_response_list(my_sets)


@router.get("/api/admin/users", response_model=list[UserListItem])
async def list_all_users(current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
	"""List all teachers and students in the system (requires admin access)."""
	if not current_user.is_admin_teacher:
		raise HTTPException(
			status_code=status.HTTP_403_FORBIDDEN,
			detail="You do not have permission to access this resource.",
		)

	# Fetch all teachers
	teachers_stmt = select(Teacher)
	teachers_res = await db.execute(teachers_stmt)
	teachers = teachers_res.scalars().all()

	# Fetch all students
	students_stmt = select(Student)
	students_res = await db.execute(students_stmt)
	students = students_res.scalars().all()

	users_list = []
	for teacher in teachers:
		users_list.append({
			"id": teacher.id,
			"username": teacher.username,
			"email": teacher.email,
			"created_at": teacher.created_at,
			"role": "teacher",
			"is_active": teacher.is_active,
			"is_admin_teacher": teacher.is_admin_teacher,
			"is_current_user": teacher.id == current_user.id,
		})

	for student in students:
		users_list.append({
			"id": student.id,
			"username": student.username,
			"email": student.email,
			"created_at": student.student_created_at,
			"role": "student",
			"is_active": student.is_active,
			"is_admin_teacher": False,
			"is_current_user": False,
		})

	# Sort by created_at descending
	users_list.sort(key=lambda u: u["created_at"], reverse=True)
	return users_list



@router.delete("/api/admin/users/{role}/{user_id}")
async def delete_user(
	role: str,
	user_id: int,
	current_user: CurrentUser,
	db: AsyncSession = Depends(get_db),
):
	"""Delete a teacher or student. Admin only. Cannot delete self or other admins."""
	if not current_user.is_admin_teacher:
		raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)

	if role == "teacher":
		if user_id == current_user.id:
			raise HTTPException(
				status_code=status.HTTP_400_BAD_REQUEST,
				detail="Cannot delete your own account",
			)
		stmt = select(Teacher).where(Teacher.id == user_id)
		result = await db.execute(stmt)
		teacher = result.scalar_one_or_none()
		if not teacher:
			raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Teacher not found")
		if teacher.is_admin_teacher:
			raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot delete an admin teacher")
		
		# 1. Get or create deleted_user with fixed ID 999999
		deleted_user_id = 999999
		deleted_user_stmt = select(Teacher).where(Teacher.id == deleted_user_id)
		deleted_user_res = await db.execute(deleted_user_stmt)
		deleted_user = deleted_user_res.scalar_one_or_none()
		if not deleted_user:
			# Check username conflict just in case
			deleted_user_name_stmt = select(Teacher).where(Teacher.username == "deleted_user")
			deleted_user_name_res = await db.execute(deleted_user_name_stmt)
			if deleted_user_name_res.scalar_one_or_none():
				# If somehow username "deleted_user" exists with a different ID, raise error
				raise HTTPException(
					status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
					detail="A user with username 'deleted_user' exists but has a different ID."
				)
			deleted_user = Teacher(
				id=deleted_user_id,
				username="deleted_user",
				email="deleted_user@deleted.invalid",
				is_active=False,
				is_admin_teacher=False,
			)
			deleted_user.set_password("deleted_user_locked_account_dummy_password_hash")
			db.add(deleted_user)
			await db.flush()

		# 2. Fetch and move all of the deleted teacher's TaskSets to deleted_user
		task_sets_stmt = select(TaskSet).where(TaskSet.teacher_id == user_id)
		task_sets_res = await db.execute(task_sets_stmt)
		task_sets = task_sets_res.scalars().all()
		for ts in task_sets:
			# Close the task set
			ts.expires_at = datetime.now(timezone.utc)

			# Resolve unique_link_code conflicts
			orig_code = ts.unique_link_code
			conflict_code_stmt = select(TaskSet).where(
				TaskSet.teacher_id == deleted_user_id,
				TaskSet.unique_link_code == orig_code
			)
			conflict_code_res = await db.execute(conflict_code_stmt)
			if conflict_code_res.scalar_one_or_none():
				ts.unique_link_code = f"{orig_code}-{teacher.username}"
				while True:
					check = await db.execute(select(TaskSet).where(
						TaskSet.teacher_id == deleted_user_id,
						TaskSet.unique_link_code == ts.unique_link_code
					))
					if not check.scalar_one_or_none():
						break
					import uuid
					ts.unique_link_code = f"{orig_code}-{uuid.uuid4().hex[:6]}"

			# Resolve title conflicts
			orig_title = ts.title
			conflict_title_stmt = select(TaskSet).where(
				TaskSet.teacher_id == deleted_user_id,
				TaskSet.title == orig_title
			)
			conflict_title_res = await db.execute(conflict_title_stmt)
			if conflict_title_res.scalar_one_or_none():
				ts.title = f"{orig_title} ({teacher.username})"
				suffix = 1
				while True:
					check = await db.execute(select(TaskSet).where(
						TaskSet.teacher_id == deleted_user_id,
						TaskSet.title == ts.title
					))
					if not check.scalar_one_or_none():
						break
					ts.title = f"{orig_title} ({teacher.username} - {suffix})"
					suffix += 1

			ts.teacher_id = deleted_user_id

		# 3. Identify and move Parsons tasks to deleted_user (only keeping public tasks)
		tasks_to_keep_stmt = select(Parsons).where(
			Parsons.created_by_teacher_id == user_id,
			Parsons.is_public == True
		)
		tasks_to_keep_res = await db.execute(tasks_to_keep_stmt)
		tasks_to_keep = tasks_to_keep_res.scalars().all()
		for task in tasks_to_keep:
			# Resolve title conflicts
			orig_task_title = task.title
			conflict_task_title_stmt = select(Parsons).where(
				Parsons.created_by_teacher_id == deleted_user_id,
				Parsons.title == orig_task_title
			)
			conflict_task_title_res = await db.execute(conflict_task_title_stmt)
			if conflict_task_title_res.scalar_one_or_none():
				task.title = f"{orig_task_title} ({teacher.username})"
				suffix = 1
				while True:
					check = await db.execute(select(Parsons).where(
						Parsons.created_by_teacher_id == deleted_user_id,
						Parsons.title == task.title
					))
					if not check.scalar_one_or_none():
						break
					task.title = f"{orig_task_title} ({teacher.username} - {suffix})"
					suffix += 1

			# Update model answers created by this teacher for this task
			model_answers_stmt = select(ModelAnswer).where(
				ModelAnswer.parsons_id == task.id,
				ModelAnswer.created_by_teacher_id == user_id
			)
			model_answers_res = await db.execute(model_answers_stmt)
			model_answers = model_answers_res.scalars().all()
			for ma in model_answers:
				ma.created_by_teacher_id = deleted_user_id

			task.created_by_teacher_id = deleted_user_id

		# 4. Hard delete all private tasks (is_public == False) owned by the teacher
		tasks_to_delete_stmt = select(Parsons.id).where(
			Parsons.created_by_teacher_id == user_id,
			Parsons.is_public == False
		)
		tasks_to_delete_res = await db.execute(tasks_to_delete_stmt)
		tasks_to_delete_ids = tasks_to_delete_res.scalars().all()
		if tasks_to_delete_ids:
			await db.execute(
				delete(ModelAnswer).where(ModelAnswer.parsons_id.in_(tasks_to_delete_ids))
			)
			await db.execute(
				delete(Parsons).where(Parsons.id.in_(tasks_to_delete_ids))
			)

		# 5. Delete the teacher account record itself
		await db.delete(teacher)

	elif role == "student":
		stmt = select(Student).where(Student.id == user_id)
		result = await db.execute(stmt)
		student = result.scalar_one_or_none()
		if not student:
			raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")
		await db.delete(student)

	else:
		raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role")

	await db.commit()
	return {"status": "success", "message": f"{role.capitalize()} deleted"}

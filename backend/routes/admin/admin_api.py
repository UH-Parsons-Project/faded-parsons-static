import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ...auth import CurrentUser
from ...database import get_db
from ...models import RegistrationToken, TaskList, Teacher, Student, TaskAttempt
from ...pydantic import (
	ProblemSetResponse,
	CreateRegistrationTokenRequest,
	RegistrationTokenResponse,
	RegistrationTokenListItem,
	UserActivityResponse,
	UserActivityStats,
	DailyActiveUser,
	MonthlyActiveUser,
)
from ...token_utils import generate_token, hash_token

BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent
DEVELOPMENT_MODE = os.getenv("DEVELOPMENT_MODE", "false").lower() == "true"

router = APIRouter()


@router.post("/api/admin/registration-tokens", response_model=RegistrationTokenResponse)
async def create_registration_token(
	request: CreateRegistrationTokenRequest,
	current_user: CurrentUser,
	db: AsyncSession = Depends(get_db),
):
	"""Create a new registration token for teachers. Admin only."""
	# TODO: Add admin role check when implemented

	# Get or generate token
	plain_token = request.token.strip() if request.token else None

	if not plain_token:
		# Generate a new token if none provided
		plain_token = generate_token(length=32)

	# Hash the token
	token_hash = hash_token(plain_token)

	# Create token in database
	reg_token = RegistrationToken(
		token_hash=token_hash,
		created_by_admin_id=current_user.id,
	)

	db.add(reg_token)
	await db.commit()
	await db.refresh(reg_token)

	# Return token only once - this is the only time the plain token is shown
	return RegistrationTokenResponse(
		id=reg_token.id,
		token=plain_token,
		created_at=reg_token.created_at.isoformat(),
	)


@router.get("/api/admin/registration-tokens", response_model=list[RegistrationTokenListItem])
async def list_registration_tokens(
	current_user: CurrentUser,
	db: AsyncSession = Depends(get_db),
):
	"""List all registration tokens. Admin only."""
	# TODO: Add admin role check when implemented

	stmt = select(RegistrationToken).order_by(RegistrationToken.created_at.desc())
	result = await db.execute(stmt)
	tokens = result.scalars().all()

	return [
		RegistrationTokenListItem(
			id=token.id,
			created_at=token.created_at.isoformat(),
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
	# TODO: Add admin role check when implemented

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
	if not current_user.has_data_access:
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


# Import page routes to ensure they are registered (side-effect)
from . import admin  # noqa: E402,F401


@router.post("/api/admin/seed-mock-data")
async def seed_mock_data_endpoint(
	current_user: CurrentUser,
	db: AsyncSession = Depends(get_db),
):
	"""Seed mock activity data for the last 7 days. Admin only. Development only."""
	# Check admin access
	if not current_user.has_data_access:
		raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)

	# Prevent running on production
	if not DEVELOPMENT_MODE:
		raise HTTPException(
			status_code=status.HTTP_403_FORBIDDEN,
			detail="Mock data seeding is only available in development mode"
		)

	# Import the seeding function
	from ...seed import seed_mock_activity

	try:
		await seed_mock_activity()
		return {
			"status": "success",
			"message": "Mock activity data seeded successfully. Refresh your dashboard to see the data."
		}
	except Exception as e:
		raise HTTPException(
			status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
			detail=f"Failed to seed mock data: {str(e)}"
		)


@router.get("/api/all-problemsets", response_model=list[ProblemSetResponse])
async def list_all_problemsets(current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
	"""List all task lists from all teachers if the user has data access."""
	if not current_user.has_data_access:
		raise HTTPException(
			status_code=status.HTTP_403_FORBIDDEN,
			detail="You do not have permission to access this resource.",
		)

	stmt = (
		select(TaskList, Teacher.username)
		.join(Teacher, Teacher.id == TaskList.teacher_id)
		.order_by(TaskList.created_at.desc())
	)
	result = await db.execute(stmt)
	problemsets = result.all()

	return [
		ProblemSetResponse(
			id=ps.id,
			title=ps.title,
			unique_link_code=ps.unique_link_code,
			teacher_id=ps.teacher_id,
			owner_username=owner_username,
			student_description=ps.student_description,
			teacher_description=ps.teacher_description,
			created_at=ps.created_at.isoformat(),
			expires_at=ps.expires_at.isoformat() if ps.expires_at else None,
		)
		for ps, owner_username in problemsets
	]


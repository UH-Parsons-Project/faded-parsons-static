# Pydantic models for request/response
from pydantic import BaseModel

class Token(BaseModel):
    access_token: str
    token_type: str


class UserInfo(BaseModel):
    id: int
    username: str
    email: str
    has_data_access: bool
    role: str


class TaskResponse(BaseModel):
    id: int
    title: str
    task_instructions: str
    description: str | None
    task_type: str
    code_blocks: dict
    correct_solution: dict
    is_public: bool
    created_at: str


class ProblemSetResponse(BaseModel):
    id: int
    title: str
    unique_link_code: str
    teacher_id: int
    owner_username: str | None
    student_description: str | None
    teacher_description: str | None
    created_at: str
    expires_at: str | None


class ProblemSetTaskResponse(BaseModel):
    id: int
    title: str
    task_type: str
    created_at: str


class NicknameRequest(BaseModel):
    nickname: str
    unique_link_code: str


class StudentLoginRequest(BaseModel):
    username: str
    password: str
    unique_link_code: str | None = None
class StudentInTaskListResponse(BaseModel):
    username: str
    started_at: str
    last_activity_at: str
    total_attempts: int
    tasks_attempted: int


class StudentTaskAttemptResponse(BaseModel):
    task_id: int
    task_title: str
    task_type: str
    attempts: int
    success_count: int
    last_attempt_at: str


class StudentTaskStatisticsResponse(BaseModel):
    task_name: str
    task_description: str | None
    model_answer: str | None = None
    student_username: str
    total_attempts: int
    successful_attempts: int
    failed_attempts: int
    empty_attempts: int
    time_to_first_success: dict | None
    time_to_first_fail: dict | None
    attempts_detail: list[dict]


class MoveData(BaseModel):
    block_id: str
    from_container: str
    to_container: str
    from_index: int
    to_index: int
    from_indent: int
    to_indent: int
    event_time: str | None = None


class EditEventData(BaseModel):
    block_id: str
    blank_index: int
    value: str
    event_time: str


class SubmitTestResultRequest(BaseModel):
    task_id: int
    success: bool
    submitted_code: str
    test_output: str
    repr_code: str

    moves: list[MoveData] = []  # Block moves recorded during the attempt
    edits: list[EditEventData] = []  # Blank field edits recorded during the attempt


class CreateProblemRequest(BaseModel):
    taskTitle: str
    description: str
    startDescription: str
    tests: str
    solutionCode: str


class CreateTaskListRequest(BaseModel):
    title: str
    student_description: str | None = None
    teacher_description: str | None = None
    expires_at: str | None = None
    task_ids: list[int]


class TaskListResponse(BaseModel):
    id: int
    title: str
    unique_link_code: str
    teacher_id: int
    student_description: str | None
    teacher_description: str | None
    created_at: str
    expires_at: str | None


class TaskListViewerRequest(BaseModel):
    identifier: str


class TaskListViewerResponse(BaseModel):
    id: int
    task_list_id: int
    teacher_id: int
    username: str
    email: str
    created_at: str

class BlockMoveEventRequest(BaseModel):
    attempt_id: int
    block_id: str
    from_container: str
    to_container: str
    from_index: int
    to_index: int
    from_indent: int
    to_indent: int


class CreateRegistrationTokenRequest(BaseModel):
    """Request to create a new registration token."""
    token: str | None = None


class RegistrationTokenResponse(BaseModel):
    """Response containing a newly created token."""
    id: int
    token: str
    created_at: str


class RegistrationTokenListItem(BaseModel):
    """Item in registration token list."""
    id: int
    created_at: str
    created_by_admin_id: int


class DailyActiveUser(BaseModel):
    """Daily active user count."""
    date: str
    active_users: int


class MonthlyActiveUser(BaseModel):
    """Monthly active user count."""
    month: str
    active_users: int


class UserActivityStats(BaseModel):
    """User activity statistics for a user group."""
    registered_total: int
    monthly_average: float
    daily_breakdown_last_7_days: list[DailyActiveUser]
    monthly_breakdown: list[MonthlyActiveUser]


class UserActivityResponse(BaseModel):
    """Combined user activity response for students and teachers."""
    students: UserActivityStats
    teachers: UserActivityStats

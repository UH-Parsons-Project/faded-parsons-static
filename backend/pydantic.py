# Pydantic models for request/response
from pydantic import BaseModel

class Token(BaseModel):
    access_token: str
    token_type: str


class UserInfo(BaseModel):
    id: int
    username: str
    email: str
    is_admin_teacher: bool
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


class TaskSetResponse(BaseModel):
    id: int
    title: str
    unique_link_code: str
    teacher_id: int
    owner_username: str | None
    student_description: str | None
    teacher_description: str | None
    created_at: str
    expires_at: str | None
    deletable: bool = True


class TaskSetTaskResponse(BaseModel):
    id: int
    title: str
    task_type: str
    created_at: str
    is_hidden: bool = False
    is_public: bool = True


class ProblemSetInfoResponse(BaseModel):
    id: int
    title: str
    student_description: str | None


class NicknameRequest(BaseModel):
    nickname: str
    unique_link_code: str


class StudentLoginRequest(BaseModel):
    username: str
    password: str
    unique_link_code: str | None = None
class StudentInTaskSetResponse(BaseModel):
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
    thinking_time: dict | None
    move_count: int | None
    attempts_detail: list[dict]
    total_time_seconds: float | None = None
    sessions: list[dict] = []
    task_set_name: str | None = None
    task_set_code: str | None = None


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


class StartTaskResponse(BaseModel):
    started_at: str
    session_id: int
    entered_at: str


class EnterTaskResponse(BaseModel):
    session_id: int
    entered_at: str


class RecordExitRequest(BaseModel):
    session_id: int
    exited_at: str   # ISO 8601 datetime
    exit_reason: str  # "inactivity_timeout" | "manual_navigation" | "page_close"


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
    modelAnswerCode: str | None = None
    parsonsRepr: str | None = None
    customErrorMessages: str | None = None
    is_public: bool | None = True


class CreateTaskSetRequest(BaseModel):
    title: str
    student_description: str | None = None
    teacher_description: str | None = None
    expires_at: str | None = None
    task_ids: list[int]


class UpdateExpiresAtRequest(BaseModel):
    expires_at: str | None = None



class TaskSetViewerRequest(BaseModel):
    identifier: str


class TaskSetViewerResponse(BaseModel):
    id: int
    task_set_id: int
    teacher_id: int
    username: str
    email: str
    created_at: str

class TeacherLookupResponse(BaseModel):
    teacher_id: int
    username: str
    email: str

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
    expires_at: str


class RegistrationTokenListItem(BaseModel):
    """Item in registration token list."""
    id: int
    created_at: str
    expires_at: str
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

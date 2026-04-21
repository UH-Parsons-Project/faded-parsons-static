THIS FILE IS FOR REFERENCE ONLY. PLEASE KEEP IT UP TO DATE WHEN MODIFYING THE SCHEMA IN MODELS.PY.

CREATE TABLE teachers (
	id SERIAL PRIMARY KEY,
	username VARCHAR(100) UNIQUE NOT NULL,
	password_hash VARCHAR(255) NOT NULL,
	email VARCHAR(100) UNIQUE NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	is_active BOOLEAN DEFAULT TRUE,
	is_admin_teacher BOOLEAN DEFAULT FALSE NOT NULL
);

CREATE TABLE parsons (
	id SERIAL PRIMARY KEY,
	created_by_teacher_id INTEGER NOT NULL REFERENCES teachers(id),
	title VARCHAR(255) NOT NULL,
	task_instructions TEXT NOT NULL,
	description TEXT,
	task_type VARCHAR(50) NOT NULL,
	code_blocks JSONB NOT NULL,
	correct_solution JSONB NOT NULL,
	is_public BOOLEAN DEFAULT TRUE,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE task_sets (
	id SERIAL PRIMARY KEY,
	teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
	title VARCHAR(255) UNIQUE NOT NULL,
	unique_link_code VARCHAR(50) NOT NULL UNIQUE,
	student_description TEXT,
	teacher_description TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	expires_at TIMESTAMPTZ
);

CREATE TABLE task_set_viewers (
	id SERIAL PRIMARY KEY,
	task_set_id INTEGER NOT NULL REFERENCES task_sets(id) ON DELETE CASCADE,
	teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	UNIQUE (task_set_id, teacher_id)
);

CREATE TABLE task_set_items (
	id SERIAL PRIMARY KEY,
	task_set_id INTEGER NOT NULL REFERENCES task_sets(id) ON DELETE CASCADE,
	task_id INTEGER NOT NULL REFERENCES parsons(id) ON DELETE CASCADE
);

CREATE TABLE student (
	id SERIAL PRIMARY KEY,
	username VARCHAR(20) UNIQUE NOT NULL,
	password_hash VARCHAR(255) NOT NULL,
	email VARCHAR(100) UNIQUE NOT NULL,
	student_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	student_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	is_active BOOLEAN DEFAULT TRUE,
	started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE student_task_set_enrollments (
	id SERIAL PRIMARY KEY,
	student_id INTEGER NOT NULL REFERENCES student(id) ON DELETE CASCADE,
	task_set_id INTEGER NOT NULL REFERENCES task_sets(id) ON DELETE CASCADE,
	enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	UNIQUE (student_id, task_set_id)
);

CREATE TABLE student_task_enrollments (
	id SERIAL PRIMARY KEY,
	student_id INTEGER NOT NULL REFERENCES student(id) ON DELETE CASCADE,
	task_id INTEGER NOT NULL REFERENCES parsons(id) ON DELETE CASCADE,
	task_set_id INTEGER NOT NULL REFERENCES task_sets(id) ON DELETE CASCADE,
	started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	UNIQUE (student_id, task_id, task_set_id)
);

CREATE TABLE task_sessions (
	id SERIAL PRIMARY KEY,
	student_task_enrollment_id INTEGER NOT NULL REFERENCES student_task_enrollments(id) ON DELETE CASCADE,
	entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	exited_at TIMESTAMPTZ,
	exit_reason VARCHAR(50)
);

CREATE TABLE task_attempts (
	id SERIAL PRIMARY KEY,
	student_id INTEGER NOT NULL REFERENCES student(id) ON DELETE CASCADE,
	task_id INTEGER NOT NULL REFERENCES parsons(id) ON DELETE CASCADE,
	student_task_enrollment_id INTEGER NOT NULL REFERENCES student_task_enrollments(id) ON DELETE CASCADE,
	task_session_id INTEGER REFERENCES task_sessions(id) ON DELETE SET NULL,
	completed_at TIMESTAMPTZ,
	success BOOLEAN,
	submitted_order JSONB,
	submitted_inputs JSONB
);

CREATE TABLE move_events (
	id SERIAL PRIMARY KEY,
	attempt_id INTEGER NOT NULL REFERENCES task_attempts(id) ON DELETE CASCADE,
	block_id VARCHAR(255) NOT NULL,
	from_container VARCHAR(50) NOT NULL,
	to_container VARCHAR(50) NOT NULL,
	from_index INTEGER NOT NULL,
	to_index INTEGER NOT NULL,
	from_indent INTEGER NOT NULL,
	to_indent INTEGER NOT NULL,
	event_time TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE edit_events (
	id SERIAL PRIMARY KEY,
	attempt_id INTEGER NOT NULL REFERENCES task_attempts(id) ON DELETE CASCADE,
	block_id VARCHAR(255) NOT NULL,
	blank_index INTEGER NOT NULL,
	value VARCHAR(1000) NOT NULL,
	event_time TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE registration_tokens (
	id SERIAL PRIMARY KEY,
	token_hash VARCHAR(255) UNIQUE NOT NULL,
	created_by_admin_id INTEGER NOT NULL REFERENCES teachers(id),
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE model_answers (
	id SERIAL PRIMARY KEY,
	parsons_id INTEGER NOT NULL UNIQUE REFERENCES parsons(id) ON DELETE CASCADE,
	created_by_teacher_id INTEGER NOT NULL REFERENCES teachers(id),
	answer_code TEXT NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

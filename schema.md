CREATE TABLE teachers (
	id SERIAL PRIMARY KEY,
	username VARCHAR(100) UNIQUE NOT NULL,
	password_hash VARCHAR(255) NOT NULL,
	email VARCHAR(100) UNIQUE NOT NULL,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	is_active BOOLEAN DEFAULT TRUE,
	has_data_access BOOLEAN DEFAULT FALSE NOT NULL
);

CREATE TABLE parsons (
	id SERIAL PRIMARY KEY,
	created_by_teacher_id INTEGER,
	title VARCHAR(255) NOT NULL,
	task_instructions TEXT,
	description TEXT,
	task_type VARCHAR(255),
	code_blocks TEXT,
	correct_answer TEXT,
	created_at TIMESTAMP
);

CREATE TABLE task_lists (
	id SERIAL PRIMARY KEY,
	teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
	title VARCHAR(255) NOT NULL,
	unique_link_code VARCHAR(50) NOT NULL UNIQUE,
	student_description TEXT,
	teacher_description TEXT,
	created_at TIMESTAMP,
	expires_at TIMESTAMP
);

CREATE TABLE task_list_viewers (
	id SERIAL PRIMARY KEY,
	task_list_id INTEGER NOT NULL REFERENCES task_lists(id) ON DELETE CASCADE,
	teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	UNIQUE (task_list_id, teacher_id)
);

CREATE TABLE task_list_items (
	id SERIAL PRIMARY KEY,
	task_list_id INTEGER NOT NULL REFERENCES task_lists(id) ON DELETE CASCADE,
	task_id INTEGER NOT NULL REFERENCES parsons(id) ON DELETE CASCADE
);

CREATE TABLE student_task_list_enrollments (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES student(id) ON DELETE CASCADE,
    task_list_id INTEGER NOT NULL REFERENCES task_lists(id) ON DELETE CASCADE,
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (student_id, task_list_id)
);

CREATE TABLE student (
	id SERIAL PRIMARY KEY,
	username VARCHAR(20) UNIQUE NOT NULL,
	password_hash VARCHAR(255) NOT NULL,
	email VARCHAR(100) UNIQUE NOT NULL,
	student_created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	student_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	is_active BOOLEAN DEFAULT TRUE,
	task_list_id INTEGER REFERENCES task_lists(id) ON DELETE SET NULL,
	started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE task_starts (
	id SERIAL PRIMARY KEY,
	student_id INTEGER NOT NULL REFERENCES student(id) ON DELETE CASCADE,
	task_id INTEGER NOT NULL REFERENCES parsons(id) ON DELETE CASCADE,
	started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	UNIQUE (student_id, task_id)
);

CREATE TABLE task_attempts (
	id SERIAL PRIMARY KEY,
	student_id INTEGER NOT NULL REFERENCES student(id) ON DELETE CASCADE,
	task_id INTEGER NOT NULL REFERENCES parsons(id) ON DELETE CASCADE,
	task_start_id INTEGER NOT NULL REFERENCES task_starts(id) ON DELETE CASCADE,
	completed_at TIMESTAMP,
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
	event_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

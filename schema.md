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

CREATE TABLE task_attempts (
	id SERIAL PRIMARY KEY,
	student_id INTEGER NOT NULL REFERENCES student(id) ON DELETE CASCADE,
	task_id INTEGER NOT NULL REFERENCES parsons(id) ON DELETE CASCADE,
	task_started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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

-- IMPLEMENTATION PLAN FOR BLOCK MOVE TRACKING:
--
-- 1. FRONTEND (js/problem-element.js):
--    - Capture block move events on drag start/stop
--    - Log: block_id, from_container, to_container, from_index, to_index, from_indent, to_indent
--    - Send POST to /api/telemetry/block-moves with attempt context
--
-- 2. BACKEND ENDPOINT (new):
--    POST /api/telemetry/block-moves
--    - Validate request has: attempt_id, block_id, from_container, to_container, from_index, to_index, from_indent, to_indent
--    - Insert row into move_events table
--    - Return 202 Accepted
--
-- 3. DATABASE:
--    - Each row represents one successful block move
--    - Indexed on attempt_id for fast lookup per student attempt
--    - Indexed on event_time for temporal analysis
--
-- 4. ANALYTICS QUERIES:
--    - Count total moves per attempt
--    - Track move sequence/timeline per attempt
--    - Identify blocks moved most frequently
--    - Detect stuck patterns (many moves, no progress)
--    - Time to solution (first correct vs total moves)

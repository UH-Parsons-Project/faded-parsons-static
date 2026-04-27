import {initProtectedPage, initSignedInAs, initBurgerMenu} from '/js/auth-ui.js';

initProtectedPage('/');
initSignedInAs();
initBurgerMenu();

const params = new URLSearchParams(window.location.search);
const setId = params.get('set_id');

if (!setId) {
	window.location.href = '/teacher-dashboard';
}

setupViewerSharing();

function formatDate(isoString) {
	const date = new Date(isoString);
	return date.toLocaleDateString('en-US', {
	year: 'numeric',
	month: 'short',
	day: 'numeric'
	});
}

function escapeHtml(text) {
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}

async function fetchJsonWithError(path, failureMessage) {
	const response = await fetch(path, { credentials: 'include' });
	if (!response.ok) {
		let detail = response.statusText || failureMessage;
		try {
			const body = await response.json();
			detail = body?.detail || body?.message || detail;
		} catch (e) {
			// ignore invalid JSON response body
		}
		throw new Error(`${failureMessage}: ${response.status} ${detail}`);
	}
	return response.json();
}

function setupViewerSharing() {
	const input = document.getElementById('viewer-identifier');
	const addBtn = document.getElementById('add-viewer-btn');
	if (!input || !addBtn) return;

	const addHandler = async () => {
		const identifier = input.value.trim();
		if (!identifier) return;
		addBtn.disabled = true;
		input.disabled = true;
		const added = await addViewer(identifier);
		if (added) {
			input.value = '';
		}
		input.disabled = false;
		addBtn.disabled = false;
		input.focus();
	};

	addBtn.addEventListener('click', () => {
		addHandler();
	});

	input.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			addHandler();
		}
	});
}

function showViewerError(message) {
	const container = document.getElementById('viewers-list');
	if (!container) return;

	const alert = document.createElement('div');
	alert.className = 'text-danger mb-2';
	alert.textContent = message;

	container.prepend(alert);
	setTimeout(() => {
		alert.remove();
	}, 4000);
}

function renderViewers(viewers) {
	const container = document.getElementById('viewers-list');
	if (!container) return;

	if (!viewers || viewers.length === 0) {
		container.innerHTML = '<div class="text-muted">No shared viewers yet.</div>';
		return;
	}

	container.innerHTML = '';
	viewers.forEach(viewer => {
		container.appendChild(createViewerItem(viewer));
	});
}

function createViewerItem(viewer) {
	const item = document.createElement('div');
	item.className = 'viewer-item';

	const info = document.createElement('div');
	info.innerHTML = `<strong>${escapeHtml(viewer.username)}</strong> <span class="viewer-email">${escapeHtml(viewer.email)}</span>`;

	const removeBtn = document.createElement('button');
	removeBtn.className = 'viewer-remove-btn btn-outline-danger';
	removeBtn.type = 'button';
	removeBtn.innerHTML = '<i class="fas fa-trash"></i>';
	removeBtn.title = 'Remove viewer';
	removeBtn.addEventListener('click', () => {
		if (window.confirm(`Remove access for ${viewer.username}?`)) {
			removeViewer(viewer.teacher_id);
		}
	});

	item.appendChild(info);
	item.appendChild(removeBtn);
	return item;
}

async function loadViewers() {
	try {
		const response = await fetch(`/api/my_sets/${setId}/viewers`, { credentials: 'include' });
		if (!response.ok) {
			const error = await response.json().catch(() => null);
			const detail = error?.detail || 'Failed to load viewers';
			throw new Error(detail);
		}
		const viewers = await response.json();
		renderViewers(viewers);
	} catch (error) {
		console.error('Error loading viewers:', error);
		showViewerError(error.message || 'Failed to load viewers');
	}
}

async function addViewer(identifier) {
	try {
		const response = await fetch(`/api/my_sets/${setId}/viewers`, {
			method: 'POST',
			credentials: 'include',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ identifier })
		});

		if (!response.ok) {
			const error = await response.json().catch(() => null);
			const detail = error?.detail || 'Failed to add viewer';
			throw new Error(detail);
		}

		await response.json();
		loadViewers();
		return true;
	} catch (error) {
		console.error('Error adding viewer:', error);
		showViewerError(error.message || 'Failed to add viewer');
		return false;
	}
}

async function removeViewer(teacherId) {
	try {
		const response = await fetch(`/api/my_sets/${setId}/viewers/${teacherId}`, {
			method: 'DELETE',
			credentials: 'include'
		});

		if (!response.ok) {
			const error = await response.json().catch(() => null);
			const detail = error?.detail || 'Failed to remove viewer';
			throw new Error(detail);
		}

		loadViewers();
	} catch (error) {
		console.error('Error removing viewer:', error);
		showViewerError(error.message || 'Failed to remove viewer');
	}
}

function renderListHeader(taskSet, tasks, students) {
	const container = document.getElementById('list-header');
	container.className = '';

	const url = `${window.location.protocol}//${window.location.host}/set/${encodeURIComponent(taskSet.unique_link_code)}`;
	const expiryPart = taskSet.expires_at
		? ` &nbsp;·&nbsp; <i class="far fa-clock"></i> Expires ${formatDate(taskSet.expires_at)}`
		: '';

	// Compute stats
	const studentCount = students.length;
	const taskCount = tasks.length;
	const totalAttempts = students.reduce((s, st) => s + (st.total_attempts ?? 0), 0);
	const avgProgress = studentCount > 0 && taskCount > 0
		? Math.round(students.reduce((s, st) => s + (st.tasks_attempted ?? 0), 0) / studentCount / taskCount * 100)
		: 0;

	// Distribution: fully done / in progress / not started
	const fullyDone = students.filter(st => taskCount > 0 && st.tasks_attempted >= taskCount).length;
	const inProgress = students.filter(st => st.tasks_attempted > 0 && st.tasks_attempted < taskCount).length;
	const notStarted = studentCount - fullyDone - inProgress;
	const donePct   = studentCount > 0 ? (fullyDone   / studentCount * 100).toFixed(1) : 0;
	const progPct   = studentCount > 0 ? (inProgress  / studentCount * 100).toFixed(1) : 0;

	let leftHTML = `
		<div class="taskset-page-title">${escapeHtml(taskSet.title)}</div>
		<div class="taskset-link-box">
			<span id="link-code" class="taskset-link-text">${url}</span>
			<button id="copy-btn" type="button" class="copy-btn" title="Copy URL">
				<i class="fas fa-copy"></i>
			</button>
		</div>
		<div class="taskset-meta-row">
			<i class="far fa-calendar"></i> Created ${formatDate(taskSet.created_at)}${expiryPart}
		</div>
	`;
	if (taskSet.teacher_description) {
		leftHTML += `<div class="teacher-notes-box"><strong>Teacher Notes:</strong><br>${escapeHtml(taskSet.teacher_description)}</div>`;
	}
	if (taskSet.student_description) {
		leftHTML += `<div class="student-instructions-box"><strong>Student Instructions:</strong><br>${escapeHtml(taskSet.student_description)}</div>`;
	}

	const statsHTML = `
		<div class="header-stats">
			<div class="hkpi-grid">
				<div class="hkpi c-brand">
					<div class="hkpi-label">Students</div>
					<div class="hkpi-value">${studentCount}</div>
				</div>
				<div class="hkpi c-gray">
					<div class="hkpi-label">Tasks</div>
					<div class="hkpi-value">${taskCount}</div>
				</div>
				<div class="hkpi c-green">
					<div class="hkpi-label">Avg Progress</div>
					<div class="hkpi-value">${avgProgress}%</div>
				</div>
				<div class="hkpi c-amber">
					<div class="hkpi-label">Total Attempts</div>
					<div class="hkpi-value">${totalAttempts}</div>
				</div>
			</div>
			<div class="dist-bar-wrap">
				<div class="dist-bar-label">Student Progression</div>
				<div class="dist-bar">
					<div class="dist-bar-seg done"     style="width:${donePct}%"></div>
					<div class="dist-bar-seg progress" style="width:${progPct}%"></div>
				</div>
				<div class="dist-bar-legend">
					<span class="dist-legend-item"><span class="dist-legend-dot" style="background:var(--green)"></span>${fullyDone} completed</span>
					<span class="dist-legend-item"><span class="dist-legend-dot" style="background:var(--amber)"></span>${inProgress} in progress</span>
					<span class="dist-legend-item"><span class="dist-legend-dot" style="background:var(--border);border:1px solid var(--gray)"></span>${notStarted} not started</span>
				</div>
			</div>
		</div>
	`;

	container.innerHTML = `
		<div class="header-inner">
			<div class="header-left">${leftHTML}</div>
			${statsHTML}
		</div>
	`;

	const copyBtn = document.getElementById('copy-btn');
	const linkCode = document.getElementById('link-code');
	if (copyBtn && linkCode) {
		copyBtn.addEventListener('click', () => {
			navigator.clipboard.writeText(linkCode.textContent.trim()).then(() => {
				copyBtn.classList.add('copied');
				copyBtn.innerHTML = '<i class="fas fa-check"></i>';
				setTimeout(() => {
					copyBtn.classList.remove('copied');
					copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
				}, 2000);
			}).catch(() => alert('Failed to copy URL'));
		});
	}
}

function createTaskItem(task, taskSet) {
	const item = document.createElement('div');
	item.className = 'task-set-item';
	item.onclick = () => {
		window.location.href = `/task-statistics?id=${task.id}&task_set=${taskSet.unique_link_code}&set_id=${taskSet.id}`;
	};

	const title = document.createElement('div');
	title.className = 'task-set-title';
	title.textContent = task.title;

	const meta = document.createElement('div');
	meta.className = 'task-set-meta';
	meta.innerHTML = `<i class="far fa-calendar"></i> ${formatDate(task.created_at)}`;

	const statsRow = document.createElement('div');
	statsRow.id = `task-stats-${task.id}`;
	statsRow.innerHTML = '<span class="task-stat-loading">Loading stats…</span>';

	item.appendChild(title);
	item.appendChild(meta);
	item.appendChild(statsRow);

	return item;
}

async function loadTaskStats(tasks, taskSet, enrolledCount) {
	const results = await Promise.all(
		tasks.map(task =>
			fetch(`/api/tasks/${task.id}/statistics?task_set_code=${encodeURIComponent(taskSet.unique_link_code)}`, { credentials: 'include' })
				.then(r => r.ok ? r.json() : null)
				.catch(() => null)
		)
	);
	tasks.forEach((task, i) => {
		const el = document.getElementById(`task-stats-${task.id}`);
		if (!el) return;
		const s = results[i];
		if (!s) { el.innerHTML = ''; return; }

		const completed  = s.students_completed ?? 0;
		const attempted  = Math.max(0, (s.students_attempted ?? 0) - completed);
		const total      = enrolledCount || 1;
		const notStarted = Math.max(0, total - completed - attempted);
		const donePct    = (completed / total * 100).toFixed(1);
		const progPct    = (attempted / total * 100).toFixed(1);

		el.innerHTML = `
			<div class="task-stat-bar">
				<div class="task-stat-bar-seg done"     style="width:${donePct}%"></div>
				<div class="task-stat-bar-seg progress" style="width:${progPct}%"></div>
			</div>
			<div class="task-stat-counts">
				<span class="tsc done"><span class="tsc-dot done"></span>${completed} done</span>
				${attempted > 0 ? `<span class="tsc progress"><span class="tsc-dot progress"></span>${attempted} in progress</span>` : ''}
				<span class="tsc not-started"><span class="tsc-dot not-started"></span>${notStarted} not started</span>
			</div>
		`;
	});
}

function renderTasks(tasks, taskSet) {
	const tasksList = document.getElementById('tasks-list');

	if (tasks.length === 0) {
	tasksList.innerHTML = `
		<div class="empty-state">
		<i class="fas fa-tasks"></i>
		<h4>No Tasks in This List</h4>
		<p>This task set doesn't have any tasks yet.</p>
		</div>
	`;
	} else {
	tasksList.innerHTML = '';
	tasks.forEach(task => {
		tasksList.appendChild(createTaskItem(task, taskSet));
	});
	}
}

function formatDateTime(isoString) {
	const date = new Date(isoString);
	return date.toLocaleString('en-US', {
	year: 'numeric',
	month: 'short',
	day: 'numeric',
	hour: '2-digit',
	minute: '2-digit'
	});
}

function createStudentItem(student) {
	const item = document.createElement('div');
	item.className = 'student-item';
	item.style.cursor = 'pointer';
	item.onclick = () => {
	window.location.href = `/student-attempts?student=${encodeURIComponent(student.username)}&set_id=${setId}`;
	};

	const name = document.createElement('div');
	name.className = 'student-name';
	name.textContent = student.username;

	const meta = document.createElement('div');
	meta.className = 'student-meta';
	meta.innerHTML = `
	<div class="student-meta-item">
		<i class="fas fa-user-clock"></i>
		<span>Started: ${formatDateTime(student.started_at)}</span>
	</div>
	<div class="student-meta-item">
		<i class="fas fa-clock"></i>
		<span>Last activity: ${formatDateTime(student.last_activity_at)}</span>
	</div>
	<div class="student-meta-item">
		<i class="fas fa-tasks"></i>
		<span>Tasks attempted: ${student.tasks_attempted}</span>
	</div>
	<div class="student-meta-item">
		<i class="fas fa-clipboard-list"></i>
		<span>Total attempts: ${student.total_attempts}</span>
	</div>
	`;

	item.appendChild(name);
	item.appendChild(meta);

	return item;
}

function renderStudents(students) {
	const studentsList = document.getElementById('students-list');

	// Update student count
	updateStudentCount(students.length);

	if (students.length === 0) {
	studentsList.innerHTML = `
		<div class="empty-state">
		<i class="fas fa-user-slash"></i>
		<h4>No Students Yet</h4>
		<p>No students have enrolled in this task set yet.</p>
		</div>
	`;
	} else {
	studentsList.innerHTML = '';
	studentsList.className = 'students-list';
	students.forEach(student => {
		studentsList.appendChild(createStudentItem(student));
	});
	}
}

function updateStudentCount(count) {
	document.getElementById('student-count').textContent = count;
}


function showError(message) {
	const container = document.getElementById('list-header');
	container.className = 'empty-state';
	container.innerHTML = `
	<i class="fas fa-exclamation-triangle text-danger"></i>
	<h4>Error Loading Task Set</h4>
	<p>${escapeHtml(message || 'An unexpected error occurred.')}</p>
	<a href="/teacher-dashboard" class="btn btn-primary mt-3">Back to Task Sets</a>
	`;
}

// Load task set details, tasks, and students
Promise.all([
	fetchJsonWithError(`/api/my_sets/${setId}`, 'Failed to load task set details'),
	fetchJsonWithError(`/api/my_sets/${setId}/tasks`, 'Failed to load tasks'),
	fetchJsonWithError(`/api/my_sets/${setId}/students`, 'Failed to load students')
])
	.then(([taskSet, tasks, students]) => {
	renderListHeader(taskSet, tasks, students);
	renderTasks(tasks, taskSet);
	renderStudents(students);
	loadViewers();
	document.getElementById('content-container').style.display = 'block';
	loadTaskStats(tasks, taskSet, students.length);
	})
	.catch(err => {
	console.error('Error loading data:', err);
	if (err.message.includes('401') || err.status === 401) {
		window.location.href = '/';
	} else {
		showError(err.message);
	}
	});

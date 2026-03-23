import {initProtectedPage, initSignedInAs} from '/js/auth-ui.js';

initProtectedPage('/index.html');
initSignedInAs();

const params = new URLSearchParams(window.location.search);
const listId = params.get('list_id');

if (!listId) {
	window.location.href = '/task_list_selector';
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
	item.className = 'd-flex align-items-center justify-content-between border rounded px-2 py-1 mb-2';

	const info = document.createElement('div');
	info.innerHTML = `<strong>${escapeHtml(viewer.username)}</strong> <span class="text-muted">(${escapeHtml(viewer.email)})</span>`;

	const removeBtn = document.createElement('button');
	removeBtn.className = 'btn btn-sm btn-outline-danger';
	removeBtn.type = 'button';
	removeBtn.innerHTML = '<i class="fas fa-trash"></i>';
	removeBtn.title = 'Remove viewer';
	removeBtn.addEventListener('click', () => {
		const confirmRemove = window.confirm(`Remove access for ${viewer.username}?`);
		if (!confirmRemove) return;
		removeViewer(viewer.teacher_id);
	});

	item.appendChild(info);
	item.appendChild(removeBtn);

	return item;
}

async function loadViewers() {
	try {
		const response = await fetch(`/api/problemsets/${listId}/viewers`, { credentials: 'include' });
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
		const response = await fetch(`/api/problemsets/${listId}/viewers`, {
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
		const response = await fetch(`/api/problemsets/${listId}/viewers/${teacherId}`, {
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

function renderListHeader(taskList) {
	const container = document.getElementById('list-header');
	container.className = 'mb-4';

	let headerHTML = `
	<h2 style="margin: 0 0 1rem 0;">${escapeHtml(taskList.title)}</h2>
	<div class="mb-2">
		<div style="display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; background-color: #f8f9fa; border: 1px solid #dee2e6; border-radius: 0.25rem;">
		<span id="link-code" style="font-family: monospace; font-size: 0.875rem; font-weight: normal;">
			${window.location.protocol}//${window.location.host}/set/${encodeURIComponent(taskList.unique_link_code)}
		</span>
		<button id="copy-btn" type="button" style="background: none; border: none; cursor: pointer; color: #6c757d; padding: 0; flex-shrink: 0;" title="Copy URL">
			<i class="fas fa-copy" style="font-size: 0.9rem;"></i>
		</button>
		</div>
	</div>
	<div class="text-muted" style="font-size: 0.875rem; margin-bottom: 1rem;">
		<i class="far fa-calendar"></i> Created ${formatDate(taskList.created_at)}
		${taskList.expires_at ? ` • <i class="far fa-clock"></i> Expires ${formatDate(taskList.expires_at)}` : ''}
	</div>
	`;

	if (taskList.teacher_description) {
	headerHTML += `
	<div class="task-list-description">
		<strong>Teacher Notes:</strong><br>
		${escapeHtml(taskList.teacher_description)}
	</div>
	`;
	}

	if (taskList.student_description) {
	headerHTML += `
	<div class="alert alert-info mt-3 mb-3" role="alert" style="border-left: 4px solid #17a2b8;">
		<strong>Student Instructions:</strong><br>
		${escapeHtml(taskList.student_description)}
	</div>
	`;
	}

	container.innerHTML = headerHTML;

	// Add copy functionality
	const copyBtn = document.getElementById('copy-btn');
	const linkCode = document.getElementById('link-code');

	if (copyBtn && linkCode) {
	copyBtn.addEventListener('click', () => {
		const text = linkCode.textContent.trim();
		navigator.clipboard.writeText(text).then(() => {
		const originalIcon = copyBtn.innerHTML;
		copyBtn.innerHTML = '<i class="fas fa-check"></i>';
		copyBtn.style.color = '#28a745';
		setTimeout(() => {
			copyBtn.innerHTML = originalIcon;
			copyBtn.style.color = '#6c757d';
		}, 2000);
		}).catch(() => {
		alert('Failed to copy URL');
		});
	});
	}
}

function createTaskItem(task, taskList) {
	const item = document.createElement('div');
	item.className = 'task-list-item';
	item.onclick = () => {
	window.location.href = `/statics_view?id=${task.id}&problemset=${taskList.unique_link_code}`;
	};

	const title = document.createElement('div');
	title.className = 'task-list-title';
	title.textContent = task.title;

	const meta = document.createElement('div');
	meta.className = 'task-list-meta';
	meta.innerHTML = `
	<i class="far fa-calendar"></i> ${formatDate(task.created_at)}
	• <i class="fas fa-chart-line"></i> View Statistics
	`;

	item.appendChild(title);
	item.appendChild(meta);

	return item;
}

function renderTasks(tasks, taskList) {
	const tasksList = document.getElementById('tasks-list');

	if (tasks.length === 0) {
	tasksList.innerHTML = `
		<div class="empty-state">
		<i class="fas fa-tasks"></i>
		<h4>No Tasks in This List</h4>
		<p>This task list doesn't have any tasks yet.</p>
		</div>
	`;
	} else {
	tasksList.innerHTML = '';
	tasks.forEach(task => {
		tasksList.appendChild(createTaskItem(task, taskList));
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
	window.location.href = `/student_attempts?student=${encodeURIComponent(student.username)}&list_id=${listId}`;
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
		<p>No students have attempted tasks in this list yet.</p>
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
	<h4>Error Loading Task List</h4>
	<p>${escapeHtml(message || 'An unexpected error occurred.')}</p>
	<a href="/task_list_selector" class="btn btn-primary mt-3">Back to Task Lists</a>
	`;
}

// Load task list details, tasks, and students
Promise.all([
	fetch(`/api/problemsets/${listId}`, { credentials: 'include' }).then(r => {
	if (!r.ok) throw new Error('Failed to load task list details');
	return r.json();
	}),
	fetch(`/api/problemsets/${listId}/tasks`, { credentials: 'include' }).then(r => {
	if (!r.ok) throw new Error('Failed to load tasks');
	return r.json();
	}),
	fetch(`/api/problemsets/${listId}/students`, { credentials: 'include' }).then(r => {
	if (!r.ok) throw new Error('Failed to load students');
	return r.json();
	})
])
	.then(([taskList, tasks, students]) => {
	renderListHeader(taskList);
	renderTasks(tasks, taskList);
	renderStudents(students);
	loadViewers();
	document.getElementById('content-container').style.display = 'block';
	})
	.catch(err => {
	console.error('Error loading data:', err);
	if (err.message.includes('401') || err.status === 401) {
		window.location.href = '/index.html';
	} else {
		showError(err.message);
	}
	});
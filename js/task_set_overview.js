import {initProtectedPage, initSignedInAs, initBurgerMenu} from '/js/auth-ui.js';

initProtectedPage('/');
initSignedInAs();
initBurgerMenu();

const params = new URLSearchParams(window.location.search);
const setId = params.get('set_id');

if (!setId) {
	window.location.href = '/teacher-dashboard';
}

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

	const currentUsername = document.getElementById('user-name')?.textContent?.trim();
	const isOwner = currentUsername && taskSet.owner_username === currentUsername;

	let deleteHTML = '';
	if (isOwner) {
		if (taskSet.deletable) {
			deleteHTML = `<button id="delete-set-btn" type="button" class="btn btn-sm btn-outline-danger mt-2"><i class="fas fa-trash"></i> Delete Task Set</button>`;
		} else {
			deleteHTML = `<span class="btn btn-sm btn-secondary disabled mt-2 mb-2" title="Cannot delete — students have already joined"><i class="fas fa-lock"></i> Can not be deleted, in use</span>`;
		}
	}

	let leftHTML = `
		<div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.4rem;">
		  <div class="taskset-page-title" style="margin-bottom:0">${escapeHtml(taskSet.title)}</div>
		  <a href="/heatmap?set_id=${setId}"
		     class="btn btn-sm"
		     style="background:var(--brand);border:1.5px solid var(--brand-dark);color:var(--brand-text);font-weight:700;font-size:.8rem;display:inline-flex;align-items:center;gap:.35rem;white-space:nowrap;">
		    Completion Heatmap <i class="fas fa-arrow-right"></i>
		  </a>
		</div>
		<div class="taskset-link-box">
			<span id="link-code" class="taskset-link-text">${url}</span>
			<button id="copy-btn" type="button" class="copy-btn" title="Copy URL">
				<i class="fas fa-copy"></i>
			</button>
		</div>
		<div class="taskset-meta-row">
			<i class="far fa-calendar"></i> Created ${formatDate(taskSet.created_at)}${expiryPart}
		</div>
		${deleteHTML}
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

	const viewersHTML = `
		<div class="header-viewers">
			<div class="header-viewers-title">Shared Viewers</div>
			<div class="viewer-add-form">
				<input type="text" id="viewer-identifier" placeholder="Username or email">
				<button type="button" id="add-viewer-btn">
					<i class="fas fa-user-plus"></i> Add
				</button>
			</div>
			<div class="viewer-add-hint">Add teachers who can view this task set.</div>
			<div id="viewers-list"></div>
		</div>
	`;

	container.innerHTML = `
		<div class="header-inner">
			<div class="header-left">${leftHTML}</div>
			${viewersHTML}
			${statsHTML}
		</div>
	`;

	setupViewerSharing();

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

	const deleteBtn = document.getElementById('delete-set-btn');
	if (deleteBtn) {
		deleteBtn.addEventListener('click', async () => {
			if (!confirm(`Delete "${taskSet.title}"? This cannot be undone.`)) return;
			try {
				const res = await fetch(`/api/my_sets/${setId}`, { method: 'DELETE', credentials: 'include' });
				if (res.ok) {
					window.location.href = '/teacher-dashboard';
				} else {
					const data = await res.json().catch(() => ({}));
					alert(data.detail || 'Failed to delete task set.');
				}
			} catch (err) {
				console.error('Delete failed:', err);
				alert('Failed to delete task set.');
			}
		});
	}
}

function createTaskItem(task, taskSet, isOwner) {
	const item = document.createElement('div');
	item.className = 'task-set-item' + (task.is_hidden ? ' task-inactive' : '');
	item.onclick = () => {
		window.location.href = `/task-statistics?id=${task.id}&task_set=${taskSet.unique_link_code}&set_id=${taskSet.id}`;
	};

	const headerRow = document.createElement('div');
	headerRow.className = 'task-item-header';

	const title = document.createElement('div');
	title.className = 'task-set-title';
	title.textContent = task.title;
	headerRow.appendChild(title);

	if (isOwner) {
		const toggleBtn = document.createElement('button');
		toggleBtn.className = 'task-toggle-btn' + (task.is_hidden ? ' is-inactive' : '');
		toggleBtn.type = 'button';
		toggleBtn.innerHTML = task.is_hidden
			? '<i class="fas fa-toggle-off"></i> Activate'
			: '<i class="fas fa-toggle-on"></i> Deactivate';
		toggleBtn.title = task.is_hidden ? 'Make active for students' : 'Deactivate for students';
		toggleBtn.addEventListener('click', async (e) => {
			e.stopPropagation();
			if (!task.is_hidden && !confirm(`Deactivate "${task.title}"? Students will no longer see this task.`)) return;
			toggleBtn.disabled = true;
			try {
				const res = await fetch(`/api/my_sets/${taskSet.id}/tasks/${task.id}/hidden`, {
					method: 'PATCH',
					credentials: 'include',
				});
				if (res.ok) {
					const data = await res.json();
					task.is_hidden = data.is_hidden;
					item.className = 'task-set-item' + (task.is_hidden ? ' task-inactive' : '');
					if (task.is_hidden) {
						toggleBtn.className = 'task-toggle-btn is-inactive';
						toggleBtn.innerHTML = '<i class="fas fa-toggle-off"></i> Activate';
						toggleBtn.title = 'Make active for students';
						// Move to inactive section
						const inactiveList = document.getElementById('tasks-list-inactive');
						const inactiveSection = document.getElementById('tasks-inactive-section');
						if (inactiveList) inactiveList.appendChild(item);
						if (inactiveSection) inactiveSection.style.display = '';
						// Show empty-state in active list if now empty
						const activeList = document.getElementById('tasks-list-active');
						if (activeList && activeList.querySelectorAll('.task-set-item').length === 0) {
							activeList.innerHTML = '<div class="empty-state"><i class="fas fa-check"></i><h4>No Active Tasks</h4><p>All tasks are currently deactivated.</p></div>';
						}
					} else {
						toggleBtn.className = 'task-toggle-btn';
						toggleBtn.innerHTML = '<i class="fas fa-toggle-on"></i> Deactivate';
						toggleBtn.title = 'Deactivate for students';
						// Move to active section
						const activeList = document.getElementById('tasks-list-active');
						if (activeList) {
							activeList.querySelectorAll('.empty-state').forEach(el => el.remove());
							activeList.appendChild(item);
						}
						// Hide inactive section if now empty
						const inactiveList = document.getElementById('tasks-list-inactive');
						if (inactiveList && inactiveList.querySelectorAll('.task-set-item').length === 0) {
							const inactiveSection = document.getElementById('tasks-inactive-section');
							if (inactiveSection) inactiveSection.style.display = 'none';
						}
					}
				}
			} catch (err) {
				console.error('Toggle inactive failed:', err);
			}
			toggleBtn.disabled = false;
		});
		headerRow.appendChild(toggleBtn);
	}

	const meta = document.createElement('div');
	meta.className = 'task-set-meta';
	meta.innerHTML = `<i class="far fa-calendar"></i> ${formatDate(task.created_at)}`;

	const statsRow = document.createElement('div');
	statsRow.id = `task-stats-${task.id}`;
	statsRow.innerHTML = '<span class="task-stat-loading">Loading stats…</span>';

	item.appendChild(headerRow);
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
	const currentUsername = document.getElementById('user-name')?.textContent?.trim();
	const isOwner = Boolean(currentUsername && taskSet.owner_username === currentUsername);

	tasksList.innerHTML = '';

	if (tasks.length === 0) {
		tasksList.innerHTML = `
			<div class="empty-state">
			<i class="fas fa-tasks"></i>
			<h4>No Tasks in This List</h4>
			<p>This task set doesn't have any tasks yet.</p>
			</div>
		`;
		return;
	}

	const activeTasks = tasks.filter(t => !t.is_hidden);
	const inactiveTasks = tasks.filter(t => t.is_hidden);

	// Active tasks section
	const activeContainer = document.createElement('div');
	activeContainer.id = 'tasks-list-active';
	if (activeTasks.length === 0) {
		activeContainer.innerHTML = '<div class="empty-state"><i class="fas fa-check"></i><h4>No Active Tasks</h4><p>All tasks are currently deactivated.</p></div>';
	} else {
		activeTasks.forEach(task => activeContainer.appendChild(createTaskItem(task, taskSet, isOwner)));
	}
	tasksList.appendChild(activeContainer);

	// Inactive tasks section (hidden when empty)
	const inactiveSection = document.createElement('div');
	inactiveSection.id = 'tasks-inactive-section';
	inactiveSection.style.display = inactiveTasks.length > 0 ? '' : 'none';

	const inactiveHeader = document.createElement('h3');
	inactiveHeader.className = 'mb-3 inactive-section-heading';
	inactiveHeader.textContent = 'Inactive Tasks (Students can no longer complete these tasks)';
	inactiveSection.appendChild(inactiveHeader);

	const inactiveContainer = document.createElement('div');
	inactiveContainer.id = 'tasks-list-inactive';
	inactiveTasks.forEach(task => inactiveContainer.appendChild(createTaskItem(task, taskSet, isOwner)));
	inactiveSection.appendChild(inactiveContainer);

	tasksList.appendChild(inactiveSection);
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
// Tasks endpoint requires unique_link_code, so fetch details first then parallelize the rest.
fetchJsonWithError(`/api/my_sets/${setId}`, 'Failed to load task set details')
	.then(taskSet => Promise.all([
		Promise.resolve(taskSet),
		fetchJsonWithError(`/api/my_sets/${encodeURIComponent(taskSet.unique_link_code)}/tasks`, 'Failed to load tasks'),
		fetchJsonWithError(`/api/my_sets/${setId}/students`, 'Failed to load students'),
	]))
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

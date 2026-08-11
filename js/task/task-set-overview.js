/* global $ */
import { initProtectedPage, initSignedInAs, initBurgerMenu } from '../core/auth-ui.js';
import { createPrivateBadge, isPrivateTask } from '../components/privacy-badge.js';
import { escapeHtml, formatDate, formatDateTime, showError, makeKeyActivatable } from '../utils/ui-utils.js';
import { fetchJsonWithError } from '../utils/api-utils.js';
import { loadHeatmap } from './task-set-heatmap.js';

initProtectedPage('/');
initSignedInAs();
initBurgerMenu();

const params = new URLSearchParams(window.location.search);
const setId = params.get('set_id');

let currentTaskSet = null;
let currentTasks = [];
let currentStudents = [];

// Edit mode and add task modal state
let isEditMode = false;
let allAvailableTasks = [];
let selectedAvailableTaskIds = [];
let activeTaskFilters = { query: '', activeScope: null };
let draggedTaskElement = null;

if (!setId) {
	window.location.href = '/teacher-dashboard';
}


function toDatetimeLocalValue(isoString) {
	const d = new Date(isoString);
	const pad = n => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatCsvExportTimestamp(date = new Date()) {
	const pad = value => String(value).padStart(2, '0');
	return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${String(date.getFullYear()).slice(-2)}_${pad(date.getHours())}_${pad(date.getMinutes())}`;
}

function sanitizeCsvFilenamePart(value, fallback) {
	return (value || fallback).replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase();
}

function buildCsvExportFilename(taskSet, exportType) {
	const safeTitle = sanitizeCsvFilenamePart(taskSet.title, 'task_set');
	const safeTeacherName = sanitizeCsvFilenamePart(taskSet.owner_username, 'teacher');
	return `${safeTitle}_${safeTeacherName}_${exportType}_${formatCsvExportTimestamp()}.csv`;
}



function formatCsvNumber(value) {
	if (value === null || value === undefined || Number.isNaN(value)) return '';
	return String(value);
}

function formatCsvPercent(value, total) {
	if (!total) return '';
	return formatCsvNumber(Math.round((value / total) * 10000) / 100);
}

function pipeCell(value, width) {
	const text = value === null || value === undefined ? '' : String(value);
	return text.padEnd(width, ' ');
}

function buildTaskSetCsv(tasks, taskStats, totalStudents) {
	const headers = [
		'Task Name',
		'Task Type',
		'Tries Count',
		'Tries % of Enrolled',
		'Completions Count',
		'Completions % of Enrolled',
		'Thinking Time Mean (s)',
		'Thinking Time Median (s)',
		'Thinking Time Min (s)',
		'Thinking Time Max (s)',
		'Time to First Success Mean (s)',
		'Time to First Success Median (s)',
		'Time to First Success Min (s)',
		'Time to First Success Max (s)',
		'Time to First Fail Mean (s)',
		'Time to First Fail Median (s)',
		'Time to First Fail Min (s)',
		'Time to First Fail Max (s)',
		'Moves Mean',
		'Moves Median',
		'Moves Min',
		'Moves Max',
	];

	const rows = tasks.map((task, index) => {
		const stats = taskStats[index] || {};
		const thinkingTime = stats.thinking_time || {};
		const timeToFirstSuccess = stats.time_to_first_success || {};
		const timeToFirstFail = stats.time_to_first_fail || {};
		const moves = stats.number_of_moves || {};

		return [
			task.title,
			task.task_type,
			formatCsvNumber(stats.students_attempted ?? 0),
			formatCsvPercent(stats.students_attempted ?? 0, totalStudents),
			formatCsvNumber(stats.students_completed ?? 0),
			formatCsvPercent(stats.students_completed ?? 0, totalStudents),
			formatCsvNumber(thinkingTime.avg),
			formatCsvNumber(thinkingTime.median),
			formatCsvNumber(thinkingTime.min),
			formatCsvNumber(thinkingTime.max),
			formatCsvNumber(timeToFirstSuccess.avg),
			formatCsvNumber(timeToFirstSuccess.median),
			formatCsvNumber(timeToFirstSuccess.min),
			formatCsvNumber(timeToFirstSuccess.max),
			formatCsvNumber(timeToFirstFail.avg),
			formatCsvNumber(timeToFirstFail.median),
			formatCsvNumber(timeToFirstFail.min),
			formatCsvNumber(timeToFirstFail.max),
			formatCsvNumber(moves.avg),
			formatCsvNumber(moves.median),
			formatCsvNumber(moves.min),
			formatCsvNumber(moves.max),
		];
	});

	const allRows = [headers, ...rows];
	const widths = headers.map((_, columnIndex) => Math.max(...allRows.map(row => String(row[columnIndex] ?? '').length)));

	return allRows
		.map(row => row.map((cell, columnIndex) => pipeCell(cell, widths[columnIndex])).join(' ; '))
		.join('\n');
}

function buildStudentCompletionCsv(tasks, students) {
	const headers = [
		'Student',
		'Email',
		'Completed Tasks',
		...tasks.map(task => task.title),
	];

	const rows = students.map(student => [
		student.username,
		student.email,
		formatCsvNumber(student.completed_tasks ?? 0),
		...(student.task_completion_flags || []).map(flag => String(flag ? 1 : 0)),
	]);

	const allRows = [headers, ...rows];
	const widths = headers.map((_, columnIndex) => Math.max(...allRows.map(row => String(row[columnIndex] ?? '').length)));

	return allRows
		.map(row => row.map((cell, columnIndex) => pipeCell(cell, widths[columnIndex])).join(' ; '))
		.join('\n');
}

let overviewBulkStatsPromise = null;

async function fetchOverviewTaskStats(tasks, taskSet, forceRefresh = false) {
	if (!overviewBulkStatsPromise || forceRefresh) {
		overviewBulkStatsPromise = fetch(`/api/tasksets/${encodeURIComponent(taskSet.unique_link_code)}/tasks/statistics`, { credentials: 'include' })
			.then(response => (response.ok ? response.json() : {}))
			.catch(() => {
				overviewBulkStatsPromise = null;
				return {};
			});
	}

	const bulkStats = await overviewBulkStatsPromise;
	return tasks.map(task => bulkStats[task.id] || { students_completed: 0, students_attempted: 0 });
}

async function downloadTaskSetCsv(taskSet, tasks, students) {
	const button = document.getElementById('download-task-set-csv-btn');
	if (button) {
		button.disabled = true;
		button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparing CSV';
	}

	try {
		const taskStats = await fetchOverviewTaskStats(tasks, taskSet);
		const csv = buildTaskSetCsv(tasks, taskStats, students.length);
		const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = buildCsvExportFilename(taskSet, 'ALL_DATA');
		document.body.appendChild(link);
		link.click();
		link.remove();
		URL.revokeObjectURL(url);
	} catch (error) {
		console.error('Error generating CSV:', error);
		alert('Failed to generate CSV export.');
	} finally {
		if (button) {
			button.disabled = false;
			button.innerHTML = '<i class="fas fa-download"></i> Download CSV';
		}
	}
}

async function downloadStudentCompletionCsv(taskSet, tasks, students) {
	const button = document.getElementById('download-task-set-teacher-csv-btn');
	if (button) {
		button.disabled = true;
		button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparing CSV';
	}

	try {
		const csv = buildStudentCompletionCsv(tasks, students);
		const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = buildCsvExportFilename(taskSet, 'EXERCISE_DATA');
		document.body.appendChild(link);
		link.click();
		link.remove();
		URL.revokeObjectURL(url);
	} catch (error) {
		console.error('Error generating teacher CSV:', error);
		alert('Failed to generate teacher CSV export.');
	} finally {
		if (button) {
			button.disabled = false;
			button.innerHTML = '<i class="fas fa-download"></i> Download Teacher CSV';
		}
	}
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

function buildExpiryInnerHTML(taskSet, isOwner) {
	const editBtn = isOwner
		? ` <button id="edit-expiry-btn" type="button" class="btn btn-sm btn-link p-0 ml-1" style="font-size:.8rem;vertical-align:baseline;" title="Edit expiration date"><i class="fas fa-pencil-alt"></i></button>`
		: '';
	if (taskSet.expires_at) {
		const expired = new Date(taskSet.expires_at) < new Date();
		const soon = !expired && (new Date(taskSet.expires_at) - new Date()) < 86400000;
		const color = expired ? '#c0392b' : soon ? '#e67e22' : '';
		const style = color ? ` style="color:${color}"` : '';
		return `<span${style}><i class="far fa-clock"></i> Expires ${escapeHtml(formatDateTime(taskSet.expires_at))}</span>${editBtn}`;
	}
	if (isOwner) {
		return `<button id="edit-expiry-btn" type="button" class="btn btn-sm btn-link p-0" style="font-size:.85rem;"><i class="far fa-clock"></i> Set expiry</button>`;
	}
	return '';
}

function setupExpiryEdit(taskSet, isOwner) {
	if (!isOwner) return;

	const section = document.getElementById('expiry-section');
	if (!section) return;

	function renderDisplay() {
		section.innerHTML = buildExpiryInnerHTML(taskSet, true);
		document.getElementById('edit-expiry-btn')?.addEventListener('click', showEditForm);
	}

	async function saveExpiry(isoValueOrNull) {
		try {
			const res = await fetch(`/api/my_sets/${setId}/expires_at`, {
				method: 'PATCH',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ expires_at: isoValueOrNull }),
			});
			if (!res.ok) throw new Error();
			const data = await res.json();
			taskSet.expires_at = data.expires_at;
			renderDisplay();
		} catch {
			alert('Failed to update expiration date.');
		}
	}

	function showEditForm() {
		const currentValue = taskSet.expires_at ? toDatetimeLocalValue(taskSet.expires_at) : '';
		section.innerHTML = `
			<input type="datetime-local" id="expiry-input" value="${currentValue}" style="font-size:.85rem;padding:2px 6px;">
			<button id="save-expiry-btn" type="button" class="btn btn-sm btn-primary ml-1">Save</button>
			${taskSet.expires_at ? `<button id="clear-expiry-btn" type="button" class="btn btn-sm btn-outline-secondary ml-1">Remove</button>` : ''}
			<button id="cancel-expiry-btn" type="button" class="btn btn-sm btn-outline-danger ml-1">Cancel</button>
		`;
		document.getElementById('cancel-expiry-btn').addEventListener('click', renderDisplay);
		document.getElementById('save-expiry-btn').addEventListener('click', () => {
			const val = document.getElementById('expiry-input').value;
			if (!val) { renderDisplay(); return; }
			saveExpiry(new Date(val).toISOString());
		});
		document.getElementById('clear-expiry-btn')?.addEventListener('click', () => saveExpiry(null));
	}

	document.getElementById('edit-expiry-btn')?.addEventListener('click', showEditForm);
}

function renderListHeader(taskSet, tasks, students) {
	const container = document.getElementById('list-header');
	container.className = '';

	const url = `${window.location.protocol}//${window.location.host}/${encodeURIComponent(taskSet.owner_username)}/set/${encodeURIComponent(taskSet.unique_link_code)}`;

	// Compute stats
	const studentCount = students.length;
	const activeTasks = tasks.filter(t => !t.is_hidden);
	const taskCount = activeTasks.length;

	const studentStats = students.map(st => {
		const completedActive = tasks.reduce((sum, task, index) => {
			return sum + (!task.is_hidden && st.task_completion_flags?.[index] ? 1 : 0);
		}, 0);
		const attemptedActive = tasks.reduce((sum, task, index) => {
			return sum + (!task.is_hidden && st.task_attempts?.[index] > 0 ? 1 : 0);
		}, 0);
		const activeAttempts = tasks.reduce((sum, task, index) => {
			return sum + (!task.is_hidden ? (st.task_attempts?.[index] ?? 0) : 0);
		}, 0);

		return {
			completedActive,
			attemptedActive,
			activeAttempts
		};
	});

	const totalAttempts = studentStats.reduce((sum, s) => sum + s.activeAttempts, 0);
	const totalCompletedActive = studentStats.reduce((sum, s) => sum + s.completedActive, 0);

	const avgProgress = studentCount > 0 && taskCount > 0
		? Math.round(totalCompletedActive / studentCount / taskCount * 100)
		: 0;

	// Distribution: fully done / in progress / not started
	const fullyDone = studentStats.filter(s => taskCount > 0 && s.completedActive >= taskCount).length;
	const inProgress = studentStats.filter(s => taskCount > 0 && s.attemptedActive > 0 && s.completedActive < taskCount).length;
	const notStarted = studentStats.filter(s => taskCount === 0 || s.attemptedActive === 0).length;
	const donePct   = studentCount > 0 ? (fullyDone   / studentCount * 100).toFixed(1) : 0;
	const progPct   = studentCount > 0 ? (inProgress  / studentCount * 100).toFixed(1) : 0;

	const currentUsername = document.getElementById('user-name')?.textContent?.trim();
	const isOwner = currentUsername && taskSet.owner_username === currentUsername;

	let deleteHTML = '';
	if (isOwner) {
		if (taskSet.deletable) {
			deleteHTML = `<button id="delete-set-btn" type="button" class="btn btn-sm btn-outline-danger" style="width:100%; justify-content:center; font-weight:600;font-size:.8rem;display:inline-flex;align-items:center;gap:.35rem;border-radius:var(--radius);"><i class="fas fa-trash"></i> Delete Task Set</button>`;
		} else {
			deleteHTML = `<span class="btn btn-sm btn-secondary disabled" style="width:100%; justify-content:center; font-weight:600;font-size:.8rem;display:inline-flex;align-items:center;gap:.35rem;border-radius:var(--radius);" title="Cannot delete — students have already joined"><i class="fas fa-lock"></i> In use</span>`;
		}
	}

	let descriptionsHTML = '';
	if (taskSet.teacher_description || taskSet.student_description) {
		descriptionsHTML += `<div class="descriptions-wrapper" style="margin-top:.25rem;">`;
		if (taskSet.teacher_description) {
			descriptionsHTML += `<div class="teacher-notes-box" style="margin-bottom:.5rem;"><strong>Teacher Notes:</strong><br>${escapeHtml(taskSet.teacher_description)}</div>`;
		}
		if (taskSet.student_description) {
			descriptionsHTML += `<div class="student-instructions-box" style="margin-bottom:0;"><strong>Student Instructions:</strong><br>${escapeHtml(taskSet.student_description)}</div>`;
		}
		descriptionsHTML += `</div>`;
	}

	const statsHTML = `
		<div class="header-stats" style="width:100%; display:flex; flex-direction:row; flex-wrap:nowrap; gap:1.5rem; justify-content:flex-end; align-items:stretch; overflow-x:auto; padding-bottom:.5rem;">
			<div class="hkpi-grid" style="display:flex; flex-wrap:nowrap; gap:1rem; margin-bottom:0; flex:1.5; min-width:350px;">
				<div class="hkpi c-brand" style="padding:.7rem 1rem; flex:1; display:flex; flex-direction:column; justify-content:center;">
					<div class="hkpi-label" style="font-size:.75rem; margin-bottom:.2rem; white-space:nowrap;">Students</div>
					<div class="hkpi-value" style="font-size:1.6rem;">${studentCount}</div>
				</div>
				<div class="hkpi c-gray" style="padding:.7rem 1rem; flex:1; display:flex; flex-direction:column; justify-content:center;">
					<div class="hkpi-label" style="font-size:.75rem; margin-bottom:.2rem; white-space:nowrap;">Tasks</div>
					<div class="hkpi-value" style="font-size:1.6rem;">${taskCount}</div>
				</div>
				<div class="hkpi c-green" style="padding:.7rem 1rem; flex:1; display:flex; flex-direction:column; justify-content:center;">
					<div class="hkpi-label" style="font-size:.75rem; margin-bottom:.2rem; white-space:nowrap;">Avg Progress</div>
					<div class="hkpi-value" style="font-size:1.6rem;">${avgProgress}%</div>
				</div>
				<div class="hkpi c-amber" style="padding:.7rem 1rem; flex:1; display:flex; flex-direction:column; justify-content:center;">
					<div class="hkpi-label" style="font-size:.75rem; margin-bottom:.2rem; white-space:nowrap;">Total Attempts</div>
					<div class="hkpi-value" style="font-size:1.6rem;">${totalAttempts}</div>
				</div>
			</div>
			<div class="dist-bar-wrap" style="flex:1; min-width:250px; padding:.75rem 1rem; margin:0; display:flex; flex-direction:column; justify-content:center;">
				<div class="dist-bar-label" style="font-size:.75rem; margin-bottom:.4rem;">Student Progression</div>
				<div class="dist-bar" style="margin-bottom:.4rem; height:8px;">
					<div class="dist-bar-seg done"     style="width:${donePct}%"></div>
					<div class="dist-bar-seg progress" style="width:${progPct}%"></div>
				</div>
				<div class="dist-bar-legend" style="gap:.6rem; display:flex; flex-wrap:wrap;">
					<span class="dist-legend-item" style="font-size:.7rem; white-space:nowrap;"><span class="dist-legend-dot" style="background:var(--green)"></span>${fullyDone} completed</span>
					<span class="dist-legend-item" style="font-size:.7rem; white-space:nowrap;"><span class="dist-legend-dot" style="background:var(--amber)"></span>${inProgress} in progress</span>
					<span class="dist-legend-item" style="font-size:.7rem; white-space:nowrap;"><span class="dist-legend-dot" style="background:var(--border);border:1px solid var(--gray)"></span>${notStarted} not started</span>
				</div>
			</div>
		</div>
	`;

	const actionsHTML = `
		<div class="header-manage" style="background:var(--card); border:1px solid var(--border); border-radius:var(--radius); padding:.8rem; box-shadow:var(--shadow); display:flex; flex-direction:column; gap:.75rem; min-width:260px;">
			<div>
				<div class="header-viewers-title" style="margin-bottom:.4rem; font-size:.7rem;">Data & Actions</div>
				<div class="csv-buttons-group" style="display:flex;gap:.4rem;flex-wrap:wrap;">
					<button id="download-task-set-csv-btn" type="button" class="btn btn-sm taskset-action-btn-csv" style="font-weight:600;font-size:.8rem;display:inline-flex;align-items:center;gap:.35rem;white-space:nowrap;flex:1;justify-content:center;">
						<i class="fas fa-download"></i> CSV
					</button>
					<button id="download-task-set-teacher-csv-btn" type="button" class="btn btn-sm taskset-action-btn-csv" style="font-weight:600;font-size:.8rem;display:inline-flex;align-items:center;gap:.35rem;white-space:nowrap;flex:1;justify-content:center;">
						<i class="fas fa-download"></i> Teacher CSV
					</button>
				</div>
				<div style="margin-top:.4rem; display:flex;">
					${deleteHTML}
				</div>
			</div>
		</div>
	`;

	const leftColHTML = `
		<div style="display:flex; flex-direction:column; gap:1.5rem; min-width:0;">
			<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:1.5rem; flex-wrap:wrap;">
				<div style="min-width:0;">
					<h1 class="taskset-page-title" style="margin-bottom:.25rem;">${escapeHtml(taskSet.title)}</h1>
					<div class="taskset-meta-row" style="margin-bottom:.6rem;display:flex;gap:.4rem;">
						<span class="meta-badge"><i class="far fa-calendar"></i> Created ${formatDate(taskSet.created_at)}</span>
						<span id="expiry-section" class="meta-badge">${buildExpiryInnerHTML(taskSet, isOwner)}</span>
					</div>
					<div class="taskset-link-box" style="margin-bottom:0; width:fit-content; max-width:100%;">
						<span id="link-code" class="taskset-link-text" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${url}</span>
						<button id="copy-btn" type="button" class="copy-btn" title="Copy URL"><i class="fas fa-copy"></i></button>
					</div>
				</div>
				${actionsHTML}
			</div>
			${descriptionsHTML ? `
				<div class="header-info-col" style="display:flex; flex-direction:column; min-width:0;">
					${descriptionsHTML}
				</div>
			` : ''}
		</div>
	`;

	const viewersHTML = `
		<div class="header-viewers" style="background:var(--card); border:1px solid var(--border); border-radius:var(--radius); padding:.8rem; box-shadow:var(--shadow); min-width:0; flex:1; display:flex; flex-direction:column;">
			<div class="header-viewers-title" style="margin-bottom:.4rem; font-size:.7rem; flex-shrink:0;">Shared Viewers</div>
			<div class="viewer-add-form" style="margin-bottom:.5rem; flex-shrink:0;">
				<div style="display:flex; gap:.4rem;">
					<input type="text" id="viewer-identifier" placeholder="Username or email" style="flex:1; min-width:0;">
					<button type="button" id="add-viewer-btn" style="width:auto; padding:.4rem .8rem;"><i class="fas fa-user-plus"></i></button>
				</div>
			</div>
			<div id="viewers-list" style="flex:1; overflow-y: auto; padding-right: .25rem; min-height:0;"></div>
		</div>
	`;

	const rightColHTML = `
		<div style="display:flex; flex-direction:column; gap:1.5rem; min-width:0; width:100%; height:100%;">
			${viewersHTML}
		</div>
	`;

	container.innerHTML = `
		<div class="header-inner" style="display:grid; grid-template-columns: minmax(0, 1fr) minmax(320px, 350px); gap:2rem; width:100%; align-items:stretch; margin-bottom:1.5rem;">
			${leftColHTML}
			${rightColHTML}
		</div>
	`;

	const statsContainer = document.getElementById('stats-container');
	if (statsContainer) {
		statsContainer.innerHTML = statsHTML;
	}

	setupViewerSharing();
	setupExpiryEdit(taskSet, isOwner);
	document.getElementById('download-task-set-csv-btn')?.addEventListener('click', () => {
		downloadTaskSetCsv(taskSet, tasks, students);
	});
	document.getElementById('download-task-set-teacher-csv-btn')?.addEventListener('click', () => {
		downloadStudentCompletionCsv(taskSet, tasks, students);
	});

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
	item.className = 'task-set-item' + (task.is_hidden ? ' task-inactive' : '') + (isEditMode ? ' edit-mode' : '');
	item.dataset.taskId = task.id;

	if (isEditMode) {
		item.draggable = true;
	} else {
		const navigateToStats = () => {
			window.location.href = `/task-statistics?id=${task.id}&task_set=${taskSet.unique_link_code}&set_id=${taskSet.id}`;
		};
		item.onclick = navigateToStats;
		makeKeyActivatable(item, navigateToStats);
	}

	const headerRow = document.createElement('div');
	headerRow.className = 'task-item-header';

	if (isEditMode) {
		const dragHandle = document.createElement('span');
		dragHandle.className = 'drag-handle';
		dragHandle.title = 'Drag to reorder';
		dragHandle.innerHTML = '<i class="fas fa-bars"></i>';
		headerRow.appendChild(dragHandle);
	}

	const titleWrap = document.createElement('div');
	titleWrap.style.display = 'flex';
	titleWrap.style.alignItems = 'center';
	titleWrap.style.gap = '.45rem';
	titleWrap.style.minWidth = '0';
	titleWrap.style.flex = '1';

	const title = document.createElement('div');
	title.className = 'task-set-title';
	title.textContent = task.title;
	titleWrap.appendChild(title);
	if (isPrivateTask(task)) {
		titleWrap.appendChild(createPrivateBadge());
	}
	headerRow.appendChild(titleWrap);

	const actionsWrap = document.createElement('div');
	actionsWrap.style.display = 'flex';
	actionsWrap.style.alignItems = 'center';
	actionsWrap.style.gap = '.4rem';

	if (isOwner && isEditMode) {
		const toggleBtn = document.createElement('button');
		toggleBtn.className = 'task-toggle-btn' + (task.is_hidden ? ' is-inactive' : '');
		toggleBtn.type = 'button';
		toggleBtn.innerHTML = task.is_hidden
			? '<i class="fas fa-toggle-off"></i> Activate'
			: '<i class="fas fa-toggle-on"></i> Deactivate';
		toggleBtn.title = task.is_hidden ? 'Make active for students' : 'Deactivate for students';
		toggleBtn.addEventListener('click', async (e) => {
			e.stopPropagation();
			toggleBtn.disabled = true;
			try {
				const res = await fetch(`/api/my_sets/${taskSet.id}/tasks/${task.id}/hidden`, {
					method: 'PATCH',
					credentials: 'include',
				});
				if (res.ok) {
					const data = await res.json();
					task.is_hidden = data.is_hidden;
					item.className = 'task-set-item' + (task.is_hidden ? ' task-inactive' : '') + (isEditMode ? ' edit-mode' : '');
					if (task.is_hidden) {
						toggleBtn.className = 'task-toggle-btn is-inactive';
						toggleBtn.innerHTML = '<i class="fas fa-toggle-off"></i> Activate';
						toggleBtn.title = 'Make active for students';
					} else {
						toggleBtn.className = 'task-toggle-btn';
						toggleBtn.innerHTML = '<i class="fas fa-toggle-on"></i> Deactivate';
						toggleBtn.title = 'Deactivate for students';
					}
					renderListHeader(currentTaskSet, currentTasks, currentStudents);
					renderStudents(currentStudents, currentTasks);
				}
			} catch (err) {
				console.error('Toggle inactive failed:', err);
			}
			toggleBtn.disabled = false;
		});
		actionsWrap.appendChild(toggleBtn);
	}

	headerRow.appendChild(actionsWrap);

	const meta = document.createElement('div');
	meta.className = 'task-set-meta';
	meta.innerHTML = `<i class="far fa-calendar"></i> ${formatDate(task.created_at)}`;

	const statsRow = document.createElement('div');
	statsRow.id = `task-stats-${task.id}`;
	statsRow.innerHTML = '<span class="task-stat-loading">Loading stats…</span>';

	item.appendChild(headerRow);
	item.appendChild(meta);
	item.appendChild(statsRow);

	if (isEditMode) {
		item.addEventListener('dragstart', (e) => {
			draggedTaskElement = item;
			item.classList.add('dragging');
			e.dataTransfer.effectAllowed = 'move';
		});

		item.addEventListener('dragend', () => {
			item.classList.remove('dragging');
			draggedTaskElement = null;
			document.querySelectorAll('.task-set-item').forEach((el) => el.classList.remove('drag-over'));
		});

		item.addEventListener('dragover', (e) => {
			e.preventDefault();
			if (draggedTaskElement && draggedTaskElement !== item) {
				item.classList.add('drag-over');
			}
		});

		item.addEventListener('dragleave', () => {
			item.classList.remove('drag-over');
		});

		item.addEventListener('drop', (e) => {
			e.preventDefault();
			item.classList.remove('drag-over');
			if (draggedTaskElement && draggedTaskElement !== item) {
				const draggedId = parseInt(draggedTaskElement.dataset.taskId, 10);
				const targetTaskId = parseInt(item.dataset.taskId, 10);
				const draggedIndex = currentTasks.findIndex((t) => t.id === draggedId);

				if (draggedIndex !== -1) {
					const [draggedTask] = currentTasks.splice(draggedIndex, 1);
					const newTargetIndex = currentTasks.findIndex((t) => t.id === targetTaskId);

					if (newTargetIndex !== -1) {
						currentTasks.splice(newTargetIndex, 0, draggedTask);
					} else {
						currentTasks.push(draggedTask);
					}
					renderTasks(currentTasks, taskSet);
				}
			}
		});
	}

	return item;
}

async function loadTaskStats(tasks, taskSet, enrolledCount) {
	const results = await fetchOverviewTaskStats(tasks, taskSet);
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

	if (isEditMode) {
		const editNotice = document.createElement('p');
		editNotice.className = 'text-muted style-sm mb-2';
		editNotice.style.fontSize = '0.8rem';
		editNotice.innerHTML = '<i class="fas fa-info-circle"></i> Drag tasks to reorder them. Click <strong>Done Editing</strong> when finished.';
		tasksList.appendChild(editNotice);

		const editContainer = document.createElement('div');
		editContainer.id = 'tasks-list-edit';
		tasks.forEach((task) => editContainer.appendChild(createTaskItem(task, taskSet, isOwner)));
		tasksList.appendChild(editContainer);
		loadTaskStats(tasks, taskSet, currentStudents.length);
		return;
	}

	const activeTasks = tasks.filter((t) => !t.is_hidden);
	const inactiveTasks = tasks.filter((t) => t.is_hidden);

	// Active tasks section
	const activeContainer = document.createElement('div');
	activeContainer.id = 'tasks-list-active';
	if (activeTasks.length === 0) {
		activeContainer.innerHTML = '<div class="empty-state"><i class="fas fa-check"></i><h4>No Active Tasks</h4><p>All tasks are currently deactivated.</p></div>';
	} else {
		activeTasks.forEach((task) => activeContainer.appendChild(createTaskItem(task, taskSet, isOwner)));
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
	inactiveTasks.forEach((task) => inactiveContainer.appendChild(createTaskItem(task, taskSet, isOwner)));
	inactiveSection.appendChild(inactiveContainer);

	tasksList.appendChild(inactiveSection);
	loadTaskStats(tasks, taskSet, currentStudents.length);
}

function setupEditTasksButton(taskSet) {
	const currentUsername = document.getElementById('user-name')?.textContent?.trim();
	const isOwner = Boolean(currentUsername && taskSet.owner_username === currentUsername);
	if (!isOwner) return;

	const editBtn = document.getElementById('edit-tasks-btn');
	const addBtn = document.getElementById('add-task-btn');
	if (!editBtn || !addBtn) return;

	editBtn.style.display = '';
	let editSessionInitialHidden = new Map();

	editBtn.addEventListener('click', async () => {
		if (isEditMode) {
			const newlyDeactivated = currentTasks.filter(
				(t) => t.is_hidden && !editSessionInitialHidden.get(t.id)
			);

			if (newlyDeactivated.length > 0) {
				const titles = newlyDeactivated.map((t) => `"${t.title}"`).join(', ');
				if (!confirm(`Deactivating ${titles}? Students will no longer see deactivated tasks.`)) {
					return;
				}
			}

			editBtn.disabled = true;
			editBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
			try {
				const taskIds = currentTasks.map((t) => t.id);
				const res = await fetch(`/api/my_sets/${taskSet.id}/tasks`, {
					method: 'PUT',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ task_ids: taskIds }),
				});
				if (!res.ok) {
					const data = await res.json();
					alert('Failed to save tasks: ' + (data.detail || 'Unknown error'));
				}
			} catch (err) {
				console.error('Failed to save tasks:', err);
				alert('Failed to save tasks: ' + err.message);
			}
			isEditMode = false;
			editBtn.disabled = false;
			editBtn.className = 'btn btn-sm btn-outline-secondary';
			editBtn.innerHTML = '<i class="fas fa-edit"></i> Edit Tasks';
			addBtn.style.display = 'none';
			renderTasks(currentTasks, taskSet);
		} else {
			isEditMode = true;
			editSessionInitialHidden = new Map(currentTasks.map((t) => [t.id, Boolean(t.is_hidden)]));
			editBtn.className = 'btn btn-sm btn-success';
			editBtn.innerHTML = '<i class="fas fa-check"></i> Done Editing';
			addBtn.style.display = '';
			renderTasks(currentTasks, taskSet);
		}
	});

	addBtn.addEventListener('click', async () => {
		selectedAvailableTaskIds = [];
		const confirmBtn = document.getElementById('confirm-add-task-btn');
		if (confirmBtn) confirmBtn.disabled = true;
		document.getElementById('tasks-loading').style.display = 'block';
		document.getElementById('task-selector').innerHTML = '';
		$('#add-task-modal').modal('show');
		try {
			const allTasks = await fetchJsonWithError('/api/tasks', 'Failed to load tasks');
			const existingIds = new Set(currentTasks.map((t) => t.id));
			allAvailableTasks = allTasks.filter((t) => !existingIds.has(t.id));
			document.getElementById('tasks-loading').style.display = 'none';
			applyAvailableTaskFilters();
		} catch (err) {
			console.error(err);
			document.getElementById('tasks-loading').style.display = 'none';
			alert('Failed to load available tasks');
		}
	});

	setupAvailableTaskFilters();
	setupConfirmAddTasksBtn(taskSet);
}

function setupAvailableTaskFilters() {
	const searchInput = document.getElementById('task-search');
	const filterScopes = document.querySelectorAll('.filter-scope');

	if (searchInput) {
		searchInput.addEventListener('input', (e) => {
			activeTaskFilters.query = e.target.value.toLowerCase().trim();
			applyAvailableTaskFilters();
		});
	}

	filterScopes.forEach((cb) => {
		cb.addEventListener('change', (e) => {
			if (e.target.checked) {
				filterScopes.forEach((other) => {
					if (other !== e.target) other.checked = false;
				});
				activeTaskFilters.activeScope = e.target.value;
			} else {
				activeTaskFilters.activeScope = null;
			}
			applyAvailableTaskFilters();
		});
	});
}

function applyAvailableTaskFilters() {
	const container = document.getElementById('task-selector');
	if (!container) return;

	const currentUsername = document.getElementById('user-name')?.textContent?.trim() || '';

	let filtered = allAvailableTasks.filter((t) => {
		if (activeTaskFilters.activeScope === 'my-exercises') {
			if (t.owner_username !== currentUsername) return false;
		} else if (activeTaskFilters.activeScope === 'favorites') {
			if (!t.is_favorite) return false;
		}

		if (!activeTaskFilters.query) return true;

		const q = activeTaskFilters.query;
		const scope = activeTaskFilters.activeScope;

		if (scope === 'title') return (t.title || '').toLowerCase().includes(q);
		if (scope === 'teacher') return (t.owner_username || '').toLowerCase().includes(q);
		if (scope === 'type') return (t.task_type || '').toLowerCase().includes(q);

		return (
			(t.title || '').toLowerCase().includes(q) ||
			(t.owner_username || '').toLowerCase().includes(q) ||
			(t.task_type || '').toLowerCase().includes(q)
		);
	});

	container.innerHTML = '';
	if (filtered.length === 0) {
		container.innerHTML = '<p class="text-muted text-center p-3">No available tasks found.</p>';
		return;
	}

	filtered.forEach((task) => {
		const taskEl = document.createElement('div');
		taskEl.className = 'task-item';
		if (selectedAvailableTaskIds.includes(task.id)) {
			taskEl.classList.add('selected');
		}

		const header = document.createElement('div');
		header.className = 'task-item-header';

		const title = document.createElement('div');
		title.className = 'task-item-title';
		title.textContent = task.title;

		const titleWrap = document.createElement('div');
		titleWrap.style.display = 'flex';
		titleWrap.style.alignItems = 'center';
		titleWrap.style.gap = '.45rem';
		titleWrap.style.minWidth = '0';
		titleWrap.appendChild(title);
		header.appendChild(titleWrap);

		const controlsWrap = document.createElement('div');
		controlsWrap.style.display = 'flex';
		controlsWrap.style.alignItems = 'center';
		controlsWrap.style.gap = '.2rem';
		controlsWrap.style.flexShrink = '0';
		const favoriteBtn = document.createElement('button');
		favoriteBtn.type = 'button';
		favoriteBtn.className = 'task-favorite-button' + (task.is_favorite ? ' is-favorite' : '');
		favoriteBtn.innerHTML = task.is_favorite ? '<i class="fas fa-star"></i>' : '<i class="far fa-star"></i>';
		favoriteBtn.title = task.is_favorite ? 'Remove from favorites' : 'Add to favorites';
		favoriteBtn.setAttribute('aria-label', favoriteBtn.title);
		favoriteBtn.addEventListener('click', async (e) => {
			e.preventDefault();
			e.stopPropagation();
			try {
				await toggleFavorite(task);
			} catch (error) {
				console.error('Failed to update favorite:', error);
				alert('Could not update favorite right now.');
			}
		});
		controlsWrap.appendChild(favoriteBtn);

		if (isPrivateTask(task)) {
			controlsWrap.appendChild(createPrivateBadge());
		}
		header.appendChild(controlsWrap);

		const checkbox = document.createElement('input');
		checkbox.type = 'checkbox';
		checkbox.setAttribute('aria-label', `Select task: ${task.title}`);
		checkbox.checked = selectedAvailableTaskIds.includes(task.id);

		const updateSelectionState = (isChecked) => {
			if (isChecked) {
				if (!selectedAvailableTaskIds.includes(task.id)) selectedAvailableTaskIds.push(task.id);
				taskEl.classList.add('selected');
			} else {
				selectedAvailableTaskIds = selectedAvailableTaskIds.filter((id) => id !== task.id);
				taskEl.classList.remove('selected');
			}
			const confirmBtn = document.getElementById('confirm-add-task-btn');
			if (confirmBtn) confirmBtn.disabled = selectedAvailableTaskIds.length === 0;
		};

		checkbox.addEventListener('change', (e) => {
			updateSelectionState(e.target.checked);
		});

		const content = document.createElement('div');
		content.className = 'task-item-content';

		const type = document.createElement('div');
		type.className = 'task-item-type';
		type.textContent = `Type: ${task.task_type || ''}`;

		const createdBy = document.createElement('div');
		createdBy.className = 'task-item-meta';
		createdBy.textContent = `Created by: ${task.owner_username || task.creator_username || 'Unknown teacher'}`;

		content.appendChild(header);
		content.appendChild(type);
		content.appendChild(createdBy);

		const actions = document.createElement('div');
		actions.className = 'task-item-actions';

		const previewBtn = document.createElement('button');
		previewBtn.type = 'button';
		previewBtn.className = 'preview-btn';
		previewBtn.innerHTML = '<i class="fas fa-eye"></i> Preview';
		previewBtn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			openTaskPreview(task);
		});

		actions.appendChild(previewBtn);

		taskEl.appendChild(checkbox);
		taskEl.appendChild(content);
		taskEl.appendChild(actions);

		taskEl.addEventListener('click', (e) => {
			if (e.target !== checkbox && !e.target.closest('.task-item-actions') && !e.target.closest('.task-favorite-button')) {
				checkbox.checked = !checkbox.checked;
				updateSelectionState(checkbox.checked);
			}
		});

		container.appendChild(taskEl);
	});
}

async function toggleFavorite(task) {
	const shouldFavorite = !task.is_favorite;
	const response = await fetch(`/api/tasks/${encodeURIComponent(task.id)}/favorite`, {
		method: shouldFavorite ? 'POST' : 'DELETE',
		credentials: 'include',
	});

	if (!response.ok) {
		throw new Error('Failed to update favorite');
	}

	const result = await response.json();
	task.is_favorite = Boolean(result.is_favorite);
	applyAvailableTaskFilters();
}

let previewParsonsWidget = null;

async function openTaskPreview(taskListItem) {
	try {
		const response = await fetch(`/api/tasks/${taskListItem.id}`, { credentials: 'include' });
		if (!response.ok) {
			throw new Error('Failed to load task details');
		}
		const task = await response.json();

		const modal = document.getElementById('student-preview-modal');
		const previewTaskTitle = document.getElementById('preview-task-title');
		const previewStartIntro = document.getElementById('preview-start-intro');
		const previewText = document.getElementById('preview-problem-text');
		const previewSource = document.getElementById('preview-source-sortable');
		const previewSolution = document.getElementById('preview-solution-sortable');
		const previewWrittenTests = document.getElementById('preview-written-tests');
		const previewModelAnswer = document.getElementById('preview-model-answer');

		if (!modal) {
			console.error('Preview modal not found.');
			return;
		}

		const startIntro = task.description || '';
		let problemStatement = '';
		try {
			const instr = JSON.parse(task.task_instructions || '{}');
			const baseText = instr.task_instructions || '';
			problemStatement = escapeHtml(baseText).replace(/\n/g, '<br>');
			if (instr.function_name) {
				problemStatement = `<strong>${escapeHtml(instr.function_name)}</strong><br>` + problemStatement;
			}
			if (instr.examples) {
				problemStatement += `<br><br><strong>Examples:</strong><pre style="margin-top: 0.5rem; background: #f1f5f9; padding: 0.75rem; border-radius: 6px;"><code>${escapeHtml(instr.examples)}</code></pre>`;
			}
		} catch (e) {
			problemStatement = escapeHtml(task.task_instructions || '').replace(/\n/g, '<br>');
		}

		const tests = task.correct_solution?.teacher_tests || '';
		const modelAnswerCode = task.model_answer || '';

		previewTaskTitle.innerHTML = escapeHtml(task.title || '').replace(/\n/g, '<br>');
		previewStartIntro.innerHTML = escapeHtml(startIntro).replace(/\n/g, '<br>');
		previewText.innerHTML = problemStatement;
		previewWrittenTests.textContent = tests.trim() || 'No tests written yet.';
		previewModelAnswer.textContent = modelAnswerCode.trim() || 'No model answer set yet.';

		previewSource.innerHTML = '';
		previewSolution.innerHTML = '';

		if (window.ParsonsWidget) {
			previewParsonsWidget = new window.ParsonsWidget({
				sortableId: previewSolution,
				trashId: previewSource,
				max_wrong_lines: 10,
				feedback_cb: false,
				can_indent: true,
				lang: 'en',
			});

			previewParsonsWidget.id_prefix = 'preview-sortable-codeline';

			const blocks = task.code_blocks?.blocks || [];
			const solutionCode = (task.correct_solution?.solution_code || '').replace(/\r\n/g, '\n');
			const modelAnswer = (task.model_answer || '').replace(/\r\n/g, '\n');
			const INDENT = '    ';

			const solLinesList = solutionCode.split('\n').map((l) => l.trimRight());
			const ansLinesList = modelAnswer.split('\n').map((l) => l.trimRight());

			const solLines = solLinesList.map((solLine, idx) => ({
				solLine,
				ansLine: ansLinesList[idx] || '',
				matched: false,
			}));

			const previewRepr = blocks.map((block) => {
				const codeWithBlanks = block.code.replace(/___/g, '!BLANK');
				const indented = INDENT.repeat(block.indent) + block.code;

				const matchItem = solLines.find((item) => {
					if (item.matched) return false;
					return item.solLine.replace(/!BLANK/g, '___') === indented;
				});

				if (matchItem) {
					matchItem.matched = true;
				}

				return codeWithBlanks;
			}).join('\n');

			previewParsonsWidget.init(previewRepr);

			const previewSolutionIds = previewParsonsWidget.studentGiven ? previewParsonsWidget.studentGiven.map((line) => line.id) : [];
			const previewSolutionSet = new Set(previewSolutionIds);
			const previewSourceIds = previewParsonsWidget.modified_lines
				.filter((line) => !previewSolutionSet.has(line.id))
				.map((line) => line.id);

			previewParsonsWidget.createHTMLFromLists(previewSolutionIds, previewSourceIds);
		}

		modal.classList.add('open');
		modal.setAttribute('aria-hidden', 'false');
		document.body.style.overflow = 'hidden';
	} catch (error) {
		console.error('Error previewing task:', error);
		alert('Could not load task preview.');
	}
}

document.addEventListener('DOMContentLoaded', () => {
	const closeBtn = document.getElementById('close-student-preview');
	const modal = document.getElementById('student-preview-modal');

	function closeModal() {
		if (modal) {
			modal.classList.remove('open');
			modal.setAttribute('aria-hidden', 'true');
			document.body.style.overflow = '';
		}
	}

	if (closeBtn) {
		closeBtn.addEventListener('click', closeModal);
	}

	if (modal) {
		modal.addEventListener('click', (event) => {
			if (event.target === modal) {
				closeModal();
			}
		});
	}
});

function setupConfirmAddTasksBtn(taskSet) {
	const confirmBtn = document.getElementById('confirm-add-task-btn');
	if (!confirmBtn) return;

	confirmBtn.addEventListener('click', () => {
		if (selectedAvailableTaskIds.length === 0) return;

		const addedTasks = allAvailableTasks.filter((t) => selectedAvailableTaskIds.includes(t.id));
		currentTasks.push(...addedTasks);

		$('#add-task-modal').modal('hide');
		renderTasks(currentTasks, taskSet);
	});
}

function createStudentItem(student, tasks) {
	const item = document.createElement('div');
	item.className = 'student-item';
	item.style.cursor = 'pointer';
	const navigateToAttempts = () => {
		window.location.href = `/student-attempts?student=${encodeURIComponent(student.username)}&set_id=${setId}`;
	};
	item.onclick = navigateToAttempts;
	makeKeyActivatable(item, navigateToAttempts);

	const name = document.createElement('div');
	name.className = 'student-name';
	name.textContent = student.username;

	const activeTasksAttempted = tasks.reduce((sum, task, index) => {
		return sum + (!task.is_hidden && student.task_attempts?.[index] > 0 ? 1 : 0);
	}, 0);
	const activeTotalAttempts = tasks.reduce((sum, task, index) => {
		return sum + (!task.is_hidden ? (student.task_attempts?.[index] ?? 0) : 0);
	}, 0);

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
		<span>Tasks attempted: ${activeTasksAttempted}</span>
	</div>
	<div class="student-meta-item">
		<i class="fas fa-clipboard-list"></i>
		<span>Total attempts: ${activeTotalAttempts}</span>
	</div>
	`;

	item.appendChild(name);
	item.appendChild(meta);

	return item;
}

function renderStudents(students, tasks) {
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
		studentsList.appendChild(createStudentItem(student, tasks));
	});
	}
}

function updateStudentCount(count) {
	document.getElementById('student-count').textContent = count;
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
		overviewBulkStatsPromise = null;
		currentTaskSet = taskSet;
		currentTasks = tasks;
		currentStudents = students;
		renderListHeader(taskSet, tasks, students);
		renderTasks(tasks, taskSet);
		renderStudents(students, tasks);
		setupEditTasksButton(taskSet);
		loadViewers();
		document.getElementById('content-container').style.display = 'block';
		loadTaskStats(tasks, taskSet, students.length);

		// ── View toggle wiring ──────────────────────────────
		const toggleLists   = document.getElementById('toggle-lists');
		const toggleHeatmap = document.getElementById('toggle-heatmap');
		const statsLayout   = document.getElementById('statistics-layout');
		const hmContainer   = document.getElementById('heatmap-container');

		let heatmapLoaded = false;

		toggleLists.onclick = () => {
			toggleLists.classList.add('active');
			toggleHeatmap.classList.remove('active');
			statsLayout.style.display = '';
			hmContainer.style.display = 'none';
		};

		toggleHeatmap.onclick = () => {
			toggleHeatmap.classList.add('active');
			toggleLists.classList.remove('active');
			statsLayout.style.display = 'none';
			hmContainer.style.display = '';
			if (!heatmapLoaded) {
				heatmapLoaded = true;
				loadHeatmap(taskSet, setId);
			}
		};
	})
	.catch(err => {
	console.error('Error loading data:', err);
	if (err.message.includes('401') || err.status === 401) {
		window.location.href = '/';
	} else {
		showError(err.message);
	}
	});

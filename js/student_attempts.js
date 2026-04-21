import { initSignedInAs, initProtectedPage, initBurgerMenu } from '/js/auth-ui.js';
initSignedInAs();
initProtectedPage('/');
initBurgerMenu();

const params = new URLSearchParams(window.location.search);
const studentUsername = params.get('student');
const setId = params.get('set_id');

if (!studentUsername || !setId) {
	window.location.href = '/teacher-dashboard';
	throw new Error('Missing required query params: student or set_id');
}

// Set up back button
const backBtn = document.getElementById('back-btn');
if (backBtn) {
	backBtn.href = `/task-set-overview?set_id=${setId}`;
}


function formatDateTime(isoString) {
	if (!isoString) return 'N/A';
	const date = new Date(isoString);
	return date.toLocaleString('en-US', {
	year: 'numeric',
	month: 'short',
	day: 'numeric',
	hour: '2-digit',
	minute: '2-digit'
	});
}

function escapeHtml(text) {
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}

function renderHeader(username, completedTasks, totalTasks) {
	const CIRC = 376.99;
	const notCompletedTasks = Math.max(totalTasks - completedTasks, 0);
	const hasNotCompletedTasks = notCompletedTasks > 0;
	const percent = totalTasks > 0
		? Math.round((completedTasks / totalTasks) * 100)
		: 0;
	const completedLen = totalTasks > 0 ? (completedTasks / totalTasks) * CIRC : 0;
	const notCompletedLen = totalTasks > 0 ? (notCompletedTasks / totalTasks) * CIRC : 0;
	const completedDeg = totalTasks > 0 ? (completedTasks / totalTasks) * 360 - 90 : -90;

	const container = document.getElementById('page-header');
	container.className = 'mb-4';
	container.innerHTML = `
	<h2>Student: ${escapeHtml(username)}</h2>
	<p class="text-muted">All tasks attempted by this student in this task set</p>
	<div class="d-flex flex-wrap align-items-center" style="gap: 1.25rem; margin-top: .75rem;">
		<div style="position: relative; width: 160px; height: 160px; flex: 0 0 160px;">
			<svg width="160" height="160" viewBox="0 0 160 160" aria-hidden="true">
				<circle cx="80" cy="80" r="60" fill="none" stroke="#e2e8f0" stroke-width="14"></circle>
				<circle cx="80" cy="80" r="60" fill="none" stroke="#16a34a" stroke-width="14"
					stroke-linecap="round" transform="rotate(-90 80 80)"
					stroke-dasharray="${completedLen.toFixed(1)} ${(CIRC - completedLen).toFixed(1)}"></circle>
				<circle cx="80" cy="80" r="60" fill="none" stroke="${hasNotCompletedTasks ? '#fca5a5' : 'transparent'}" stroke-width="14"
					stroke-linecap="round" transform="rotate(${completedDeg} 80 80)"
					stroke-dasharray="${notCompletedLen.toFixed(1)} ${(CIRC - notCompletedLen).toFixed(1)}"></circle>
			</svg>
			<div style="position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;">
				<div style="font-size:1.65rem; font-weight:800; line-height:1; color:#1e293b;">${totalTasks > 0 ? `${percent}%` : '—'}</div>
				<div style="font-size:.62rem; font-weight:700; letter-spacing:1px; color:#94a3b8; margin-top:.2rem;">COMPLETED</div>
			</div>
		</div>
		<div>
			<div style="font-weight:700; color:#1e293b; margin-bottom:.4rem;">Completed Tasks</div>
			<div style="font-size:1.1rem; font-weight:800; margin-bottom:.6rem;">${completedTasks}/${totalTasks} done</div>
			<div style="display:flex; align-items:center; gap:.55rem; font-size:.9rem; color:#64748b; margin-bottom:.25rem;">
				<span style="width:10px;height:10px;border-radius:50%;background:#16a34a;display:inline-block;"></span>
				<span>Completed: <strong style="color:#16a34a;">${completedTasks}</strong></span>
			</div>
			<div style="display:flex; align-items:center; gap:.55rem; font-size:.9rem; color:#64748b;">
				<span style="width:10px;height:10px;border-radius:50%;background:${hasNotCompletedTasks ? '#fca5a5' : '#cbd5e1'};display:inline-block;"></span>
				<span>Not completed: <strong style="color:${hasNotCompletedTasks ? '#dc2626' : '#64748b'};">${notCompletedTasks}</strong></span>
			</div>
		</div>
	</div>
	`;
}

function createAttemptItem(attempt) {
	const item = document.createElement('div');
	item.className = 'task-set-item';
	item.style.cursor = 'pointer';
	item.onclick = () => {
	window.location.href = `/student_task_statistics?student=${encodeURIComponent(studentUsername)}&task_id=${attempt.task_id}&set_id=${setId}`;
	};

	const title = document.createElement('div');
	title.className = 'task-set-title';
	title.textContent = attempt.task_title;

	const meta = document.createElement('div');
	meta.className = 'task-set-meta';

	const statusIcon = attempt.success_count > 0
	? '<i class="fas fa-check-circle" style="color: #28a745;"></i><span style="margin-right: 0.5rem;"> Success</span>'
	: '<i class="fas fa-times-circle" style="color: #dc3545;"></i><span style="margin-right: 0.5rem;"> Failed</span>';

	meta.innerHTML = `
	${statusIcon}
	<span style="margin-right: 1rem;">Total Attempts: ${attempt.attempts}</span>
	<i class="far fa-clock"></i> Last attempt: ${formatDateTime(attempt.last_attempt_at)}
	`;

	item.appendChild(title);
	item.appendChild(meta);

	return item;
}

function renderAttempts(attempts) {
	const attemptsContainer = document.getElementById('attempts-container');
	const attemptsList = document.getElementById('attempts-list');

	if (attempts.length === 0) {
	attemptsList.innerHTML = `
		<div class="empty-state">
		<i class="fas fa-clipboard"></i>
		<h4>No Attempts Found</h4>
		<p>This student hasn't attempted any tasks in this list yet.</p>
		</div>
	`;
	} else {
	attemptsList.innerHTML = '';
	attempts.forEach(attempt => {
		attemptsList.appendChild(createAttemptItem(attempt));
	});
	}

	attemptsContainer.style.display = 'block';
}

function showError(message) {
	const container = document.getElementById('page-header');
	container.className = 'empty-state';
	container.innerHTML = `
	<i class="fas fa-exclamation-triangle text-danger"></i>
	<h4>Error Loading Data</h4>
	<p>${escapeHtml(message || 'An unexpected error occurred.')}</p>
	<a href="/teacher-dashboard" class="btn btn-primary mt-3">Back to Task Sets</a>
	`;
}

// Load student attempts and full task set task count
Promise.all([
	fetch(`/api/students/${encodeURIComponent(studentUsername)}/attempts?set_id=${setId}`, {
		credentials: 'include'
	}),
	fetch(`/api/my_sets/${encodeURIComponent(setId)}/tasks`, {
		credentials: 'include'
	})
])
	.then(async ([attemptsResponse, taskSetTasksResponse]) => {
		if (!attemptsResponse.ok) {
			if (attemptsResponse.status === 401) {
				window.location.href = '/';
				return;
			}
			throw new Error('Failed to load student attempts');
		}

		const attempts = await attemptsResponse.json();
		const completedTasks = attempts.filter(attempt => attempt.success_count > 0).length;

		let totalTasks = attempts.length;
		if (taskSetTasksResponse.ok) {
			const taskSetTasks = await taskSetTasksResponse.json();
			totalTasks = taskSetTasks.length;
		}

		renderHeader(studentUsername, completedTasks, totalTasks);
		renderAttempts(attempts);
	})
	.catch(err => {
	console.error('Error loading attempts:', err);
	if (err.message && err.message.includes('401')) {
		window.location.href = '/';
	} else {
		showError(err.message);
	}
	});

import { initSignedInAs, initProtectedPage } from '/js/auth-ui.js';
initSignedInAs();
initProtectedPage('/');

const params = new URLSearchParams(window.location.search);
const studentUsername = params.get('student');
const listId = params.get('list_id');

if (!studentUsername || !listId) {
	window.location.href = '/teacher-dashboard';
}

// Set up back button
document.getElementById('back-btn').href = `/task_list_statistics?list_id=${listId}`;


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

function renderHeader(username) {
	const container = document.getElementById('page-header');
	container.className = 'mb-4';
	container.innerHTML = `
	<h2>Student: ${escapeHtml(username)}</h2>
	<p class="text-muted">All tasks attempted by this student in this task list</p>
	`;
}

function createAttemptItem(attempt) {
	const item = document.createElement('div');
	item.className = 'task-list-item';
	item.style.cursor = 'pointer';
	item.onclick = () => {
	window.location.href = `/student_task_statistics?student=${encodeURIComponent(studentUsername)}&task_id=${attempt.task_id}&list_id=${listId}`;
	};

	const title = document.createElement('div');
	title.className = 'task-list-title';
	title.textContent = attempt.task_title;

	const meta = document.createElement('div');
	meta.className = 'task-list-meta';

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
	<a href="/teacher-dashboard" class="btn btn-primary mt-3">Back to Task Lists</a>
	`;
}

// Load student attempts
fetch(`/api/students/${encodeURIComponent(studentUsername)}/attempts?list_id=${listId}`, {
	credentials: 'include'
})
	.then(r => {
	if (!r.ok) {
		if (r.status === 401) {
		window.location.href = '/';
		return;
		}
		throw new Error('Failed to load student attempts');
	}
	return r.json();
	})
	.then(attempts => {
	renderHeader(studentUsername);
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

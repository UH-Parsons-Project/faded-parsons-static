import {initProtectedPage, initSignedInAs} from '/js/auth-ui.js';

initProtectedPage('/');
initSignedInAs();

const userNameEl = document.getElementById('user-name');
const storedUsername = localStorage.getItem('username');
if (storedUsername) {
	userNameEl.textContent = storedUsername;
} else {
	fetch('/api/me', { credentials: 'include' })
	.then(r => r.ok ? r.json() : Promise.reject())
	.then(data => {
		if (data?.username) {
		userNameEl.textContent = data.username;
		localStorage.setItem('username', data.username);
		}
	})
	.catch(() => { userNameEl.textContent = ''; });
}

function formatDate(isoString) {
	const date = new Date(isoString);
	return date.toLocaleDateString('en-US', {
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

// ==================== Task Sets ====================

function createTaskSetItem(taskSet) {
	const item = document.createElement('div');
	item.className = 'task-set-item';
	item.onclick = () => {
	window.location.href = `/task-set-overview?set_id=${taskSet.id}`;
	};

	const title = document.createElement('div');
	title.className = 'task-set-title';
	title.textContent = taskSet.title;

	const code = document.createElement('div');
	code.className = 'mb-2';
	const codeSpan = document.createElement('span');
	codeSpan.className = 'task-set-code';
	codeSpan.textContent = taskSet.unique_link_code;
	code.appendChild(codeSpan);

	const meta = document.createElement('div');
	meta.className = 'task-set-meta';
	meta.innerHTML = `
	<i class="far fa-user"></i> Teacher ID: ${taskSet.teacher_id}<br>
	<i class="far fa-calendar"></i> Created ${formatDate(taskSet.created_at)}
	${taskSet.expires_at ? `<br><i class="far fa-clock"></i> Expires ${formatDate(taskSet.expires_at)}` : ''}
	`;

	item.appendChild(title);
	item.appendChild(code);
	item.appendChild(meta);

	return item;
}

function renderTaskSets(taskSets) {
	const container = document.getElementById('task-sets-container');
	container.className = '';
	container.innerHTML = '';

	if (taskSets.length === 0) {
	container.innerHTML = `
		<div class="empty-state">
		<i class="fas fa-folder-open"></i>
		<h4>No Task Sets Found</h4>
		<p>There are no task sets in the system yet.</p>
		</div>
	`;
	} else {
	const listsColumn = document.createElement('div');
	listsColumn.className = 'task-sets-column';

	taskSets.forEach(taskSet => {
		listsColumn.appendChild(createTaskSetItem(taskSet));
	});

	container.appendChild(listsColumn);
	}
}

function showError(message) {
	const container = document.getElementById('task-sets-container');
	container.className = 'empty-state';
	container.innerHTML = `
	<i class="fas fa-exclamation-triangle text-danger"></i>
	<h4>Error Loading Task Sets</h4>
	<p>${escapeHtml(message || 'An unexpected error occurred.')}</p>
	`;
}

// ==================== Page Initialization ====================

fetch('/api/all-tasksets', { credentials: 'include' })
	.then(r => {
	if (!r.ok) {
		if (r.status === 401 || r.status === 403) {
		window.location.href = '/';
		return;
		}
		throw new Error('Failed to load task sets');
	}
	return r.json();
	})
	.then(data => {
	if (data) {
		renderTaskSets(data);
	}
	})
	.catch(err => {
	console.error('Error loading task sets:', err);
	showError(err.message);
	});

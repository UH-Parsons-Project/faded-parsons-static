

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
	day: 'numeric'
	});
}

function escapeHtml(text) {
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}

function createTaskListItem(taskList) {
	const item = document.createElement('div');
	item.className = 'task-list-item';
	item.onclick = () => {
	window.location.href = `/task_list_statistics?list_id=${taskList.id}`;
	};

	const title = document.createElement('div');
	title.className = 'task-list-title';
	title.textContent = taskList.title;

	const code = document.createElement('div');
	code.className = 'mb-2';
	const codeSpan = document.createElement('span');
	codeSpan.className = 'task-list-code';
	codeSpan.textContent = taskList.unique_link_code;
	code.appendChild(codeSpan);

	const meta = document.createElement('div');
	meta.className = 'task-list-meta';
	meta.innerHTML = `
	<i class="far fa-user"></i> Teacher ID: ${taskList.teacher_id}<br>
	<i class="far fa-calendar"></i> Created ${formatDate(taskList.created_at)}
	${taskList.expires_at ? `<br><i class="far fa-clock"></i> Expires ${formatDate(taskList.expires_at)}` : ''}
	`;

	item.appendChild(title);
	item.appendChild(code);
	item.appendChild(meta);

	return item;
}

function renderTaskLists(taskLists) {
	const container = document.getElementById('task-lists-container');
	container.className = '';
	container.innerHTML = '';

	if (taskLists.length === 0) {
	container.innerHTML = `
		<div class="empty-state">
		<i class="fas fa-folder-open"></i>
		<h4>No Task Lists Found</h4>
		<p>There are no task lists in the system yet.</p>
		</div>
	`;
	} else {
	const listsColumn = document.createElement('div');
	listsColumn.className = 'task-lists-column';

	taskLists.forEach(taskList => {
		listsColumn.appendChild(createTaskListItem(taskList));
	});
	
	container.appendChild(listsColumn);
	}
}

function showError(message) {
	const container = document.getElementById('task-lists-container');
	container.className = 'empty-state';
	container.innerHTML = `
	<i class="fas fa-exclamation-triangle text-danger"></i>
	<h4>Error Loading Task Lists</h4>
	<p>${escapeHtml(message || 'An unexpected error occurred. You might not have permission to view this page.')}</p>
	`;
}

// Load task lists
fetch('/api/all-problemsets', { credentials: 'include' })
	.then(r => {
	if (!r.ok) {
		if (r.status === 401 || r.status === 403) {
		window.location.href = '/index.html';
		return;
		}
		throw new Error('Failed to load task lists');
	}
	return r.json();
	})
	.then(data => {
	if (data) {
		renderTaskLists(data);
	}
	})
	.catch(err => {
	console.error('Error loading task lists:', err);
	showError(err.message);
	});
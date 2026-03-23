// Load user info
const userNameEl = document.getElementById('user-name');
const allSetsButtonContainer = document.getElementById('all-sets-button-container');
let currentUserId = null;

fetch('/api/me', { credentials: 'include' })
	.then(r => r.ok ? r.json() : Promise.reject('Failed to fetch user data'))
	.then(data => {
		currentUserId = data?.id ?? null;
		if (data?.username) {
			userNameEl.textContent = data.username;
			localStorage.setItem('username', data.username);
		}
		if (data?.has_data_access) {
			allSetsButtonContainer.style.display = 'block';
		}
	})
	.catch(error => {
		console.error(error);
		userNameEl.textContent = '';
	});

// Handle logout button
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
	logoutBtn.addEventListener('click', async () => {
	try {
		await fetch('/api/logout', { method: 'POST' });
		localStorage.removeItem('auth_token');
		localStorage.removeItem('username');
		window.location.href = '/index.html';
	} catch (error) {
		console.error('Logout error:', error);
		window.location.href = '/index.html';
	}
	});
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

	const meta = document.createElement('div');
	meta.className = 'task-list-meta';
	meta.innerHTML = `
	<i class="far fa-calendar"></i> Created ${formatDate(taskList.created_at)}
	${taskList.expires_at ? `<br><i class="far fa-clock"></i> Expires ${formatDate(taskList.expires_at)}` : ''}
	`;

	item.appendChild(title);
	item.appendChild(meta);

	if (currentUserId && taskList.teacher_id !== currentUserId && taskList.owner_username) {
		const sharedLabel = document.createElement('div');
		sharedLabel.className = 'text-muted';
		sharedLabel.style.fontSize = '0.8rem';
		sharedLabel.textContent = `Shared by ${taskList.owner_username}`;
		item.appendChild(sharedLabel);
	}

	if (taskList.teacher_description) {
	const description = document.createElement('div');
	description.className = 'task-list-description';

	// Truncate to 100 characters and add ellipsis if longer
	let displayText = taskList.teacher_description;
	if (displayText.length > 100) {
		displayText = displayText.substring(0, 100) + '...';
	}
	description.textContent = displayText;
	description.title = taskList.teacher_description; // Show full text on hover

	item.appendChild(description);
	}

	return item;
}

function createAddButton() {
	const button = document.createElement('div');
	button.className = 'create-new-card';
	button.onclick = () => {
	window.location.href = '/create_task_list';
	};

	button.innerHTML = `
	<i class="fas fa-plus-circle"></i>
	<div class="task-list-title">Create New Task List</div>
	<p class="mb-0" style="font-size: 0.875rem;">Add a new task list</p>
	`;

	return button;
}

function renderTaskLists(taskLists) {
	const container = document.getElementById('task-lists-container');
	container.className = '';
	container.innerHTML = '';

	if (taskLists.length === 0) {
	container.innerHTML = `
		<div class="empty-state">
		<i class="fas fa-folder-open"></i>
		<h4>No Task Lists Yet</h4>
		<p>Create your first task list to get started with organizing exercises and viewing statistics.</p>
		</div>
	`;
	const buttonWrapper = document.createElement('div');
	buttonWrapper.style.maxWidth = '300px';
	buttonWrapper.style.margin = '0 auto';
	buttonWrapper.appendChild(createAddButton());
	container.appendChild(buttonWrapper);
	} else {
	const layout = document.createElement('div');
	layout.className = 'task-list-selector-layout';

	const listsColumn = document.createElement('div');
	listsColumn.className = 'task-lists-column';

	const ownedLists = currentUserId
		? taskLists.filter(taskList => taskList.teacher_id === currentUserId)
		: taskLists;
	const sharedLists = currentUserId
		? taskLists.filter(taskList => taskList.teacher_id !== currentUserId)
		: [];

	const ownedSection = document.createElement('div');
	ownedSection.className = 'task-list-section';
	ownedSection.innerHTML = '<h4 class="mb-3">Your Task Lists</h4>';

	const ownedContainer = document.createElement('div');
	if (ownedLists.length === 0) {
		ownedContainer.innerHTML = '<div class="text-muted mb-3">No task lists yet.</div>';
	} else {
		ownedLists.forEach(taskList => {
			ownedContainer.appendChild(createTaskListItem(taskList));
		});
	}
	ownedSection.appendChild(ownedContainer);

	const sharedSection = document.createElement('div');
	sharedSection.className = 'task-list-section mt-4';
	sharedSection.innerHTML = '<h4 class="mb-3">Shared With You</h4>';

	const sharedContainer = document.createElement('div');
	if (sharedLists.length === 0) {
		sharedContainer.innerHTML = '<div class="text-muted">No shared task lists.</div>';
	} else {
		sharedLists.forEach(taskList => {
			sharedContainer.appendChild(createTaskListItem(taskList));
		});
	}
	sharedSection.appendChild(sharedContainer);

	listsColumn.appendChild(ownedSection);
	listsColumn.appendChild(sharedSection);

	const addColumn = document.createElement('div');
	addColumn.className = 'add-button-column';
	addColumn.appendChild(createAddButton());

	layout.appendChild(listsColumn);
	layout.appendChild(addColumn);
	container.appendChild(layout);
	}
}

function showError(message) {
	const container = document.getElementById('task-lists-container');
	container.className = 'empty-state';
	container.innerHTML = `
	<i class="fas fa-exclamation-triangle text-danger"></i>
	<h4>Error Loading Task Lists</h4>
	<p>${escapeHtml(message || 'An unexpected error occurred. Please try again later.')}</p>
	`;
}

// Load task lists
fetch('/api/problemsets', { credentials: 'include' })
	.then(r => {
	if (!r.ok) {
		if (r.status === 401) {
		window.location.href = '/index.html';
		return;
		}
		throw new Error('Failed to load task lists');
	}
	return r.json();
	})
	.then(data => {
	renderTaskLists(data);
	})
	.catch(err => {
	console.error('Error loading task lists:', err);
	showError(err.message);
	});


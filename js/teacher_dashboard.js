import {initProtectedPage, initSignedInAs, initBurgerMenu} from '/js/auth-ui.js';

initProtectedPage('/');
initSignedInAs();
initBurgerMenu();

// Load user info
const userNameEl = document.getElementById('user-name');
const allSetsButtonContainer = document.getElementById('all-sets-button-container');
let currentUsername = null;

async function loadCurrentUser() {
	try {
		const response = await fetch('/api/me', { credentials: 'include' });
		if (!response.ok) {
			throw new Error('Failed to fetch user data');
		}
		const data = await response.json();
		currentUsername = data?.username ?? null;
		if (data?.username) {
			userNameEl.textContent = data.username;
			localStorage.setItem('username', data.username);
		}
		if (data?.is_admin_teacher) {
			allSetsButtonContainer.style.display = 'block';
		}
	} catch (error) {
		console.error(error);
		userNameEl.textContent = '';
	}
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

function createTaskSetItem(taskSet) {
	const item = document.createElement('div');
	item.className = 'task-set-item';
	item.onclick = () => {
		window.location.href = `/task-set-overview?set_id=${taskSet.id}`;
	};

	// Top row: title + join code chip
	const topRow = document.createElement('div');
	topRow.className = 'task-set-item-top';

	const title = document.createElement('div');
	title.className = 'task-set-title';
	title.textContent = taskSet.title;
	topRow.appendChild(title);

	if (taskSet.unique_link_code) {
		const chip = document.createElement('div');
		chip.className = 'task-set-code-chip';
		chip.title = 'Click to copy link';
		chip.innerHTML = `<i class="far fa-copy"></i>${taskSet.unique_link_code}`;
		chip.onclick = (e) => {
			e.stopPropagation();
			const url = `${window.location.protocol}//${window.location.host}/set/${encodeURIComponent(taskSet.unique_link_code)}`;
			navigator.clipboard.writeText(url).then(() => {
				chip.classList.add('copied');
				chip.innerHTML = `<i class="fas fa-check"></i>${taskSet.unique_link_code}`;
				setTimeout(() => {
					chip.classList.remove('copied');
					chip.innerHTML = `<i class="far fa-copy"></i>${taskSet.unique_link_code}`;
				}, 1500);
			});
		};
		topRow.appendChild(chip);
	}

	item.appendChild(topRow);

	const meta = document.createElement('div');
	meta.className = 'task-set-meta';
	const expiryPart = taskSet.expires_at
		? ` &nbsp;·&nbsp; <i class="far fa-clock"></i> Expires ${formatDate(taskSet.expires_at)}`
		: '';
	const sharedPart = (currentUsername && taskSet.owner_username && taskSet.owner_username !== currentUsername)
		? ` &nbsp;·&nbsp; <i class="fas fa-share-alt"></i> Shared by ${escapeHtml(taskSet.owner_username)}`
		: '';
	meta.innerHTML = `<i class="far fa-calendar"></i> Created ${formatDate(taskSet.created_at)}${expiryPart}${sharedPart}`;
	item.appendChild(meta);

	if (taskSet.teacher_description) {
		const description = document.createElement('div');
		description.className = 'task-set-description';
		let displayText = taskSet.teacher_description;
		if (displayText.length > 228) {
			displayText = displayText.substring(0, 228) + '…';
		}
		description.textContent = displayText;
		description.title = taskSet.teacher_description;
		item.appendChild(description);
	}

	return item;
}

function renderTaskSets(taskSets) {
	const container = document.getElementById('task-sets-container');
	container.className = '';
	container.innerHTML = '';

	const headerRow = document.createElement('div');
	headerRow.className = 'section-header-row';
	const heading = document.createElement('h4');
	heading.textContent = 'My Task Sets';
	const createBtn = document.createElement('a');
	createBtn.href = '/create-task-set';
	createBtn.className = 'section-create-btn';
	createBtn.innerHTML = '<i class="fas fa-plus"></i> New Task Set';
	headerRow.appendChild(heading);
	headerRow.appendChild(createBtn);
	container.appendChild(headerRow);

	if (taskSets.length === 0) {
		container.insertAdjacentHTML('beforeend', `
			<div class="empty-state">
			<i class="fas fa-folder-open"></i>
			<h4>No Task Sets Yet</h4>
			<p>Create your first task set to get started with organizing exercises and viewing statistics.</p>
			</div>
		`);
		return;
	}

	const searchBox = document.createElement('div');
	searchBox.className = 'search-box';
	searchBox.innerHTML = '<i class="fas fa-search"></i><input type="text" id="task-search" placeholder="Search task sets…" autocomplete="off">';
	container.appendChild(searchBox);

	const ownedLists = currentUsername
		? taskSets.filter(taskSet => taskSet.owner_username === currentUsername)
		: taskSets;
	const sharedLists = currentUsername
		? taskSets.filter(taskSet => taskSet.owner_username !== currentUsername)
		: [];

	const ownedSection = document.createElement('div');
	ownedSection.className = 'task-set-section';

	const ownedContainer = document.createElement('div');
	if (ownedLists.length === 0) {
		ownedContainer.innerHTML = '<div class="text-muted mb-3">No task sets yet.</div>';
	} else {
		ownedLists.forEach(taskSet => {
			ownedContainer.appendChild(createTaskSetItem(taskSet));
		});
	}
	ownedSection.appendChild(ownedContainer);

	const sharedSection = document.createElement('div');
	sharedSection.className = 'task-set-section mt-4';
	sharedSection.innerHTML = '<h4 class="mb-3">Shared With You</h4>';

	const sharedContainer = document.createElement('div');
	if (sharedLists.length === 0) {
		sharedContainer.innerHTML = '<div class="text-muted">No shared task sets.</div>';
	} else {
		sharedLists.forEach(taskSet => {
			sharedContainer.appendChild(createTaskSetItem(taskSet));
		});
	}
	sharedSection.appendChild(sharedContainer);

	container.appendChild(ownedSection);
	container.appendChild(sharedSection);
	setupSearch();
}

function setupSearch() {
	const input = document.getElementById('task-search');
	if (!input) return;
	const taskSetsContainer = document.getElementById('task-sets-container');
	input.addEventListener('input', () => {
		const q = input.value.trim().toLowerCase();
		let totalVisible = 0;
		taskSetsContainer.querySelectorAll('.task-set-section').forEach(section => {
			const items = section.querySelectorAll('.task-set-item');
			let sectionVisible = 0;
			items.forEach(item => {
				const title = item.querySelector('.task-set-title')?.textContent.toLowerCase() ?? '';
				const code = item.querySelector('.task-set-code-chip')?.textContent.toLowerCase() ?? '';
				const match = !q || title.includes(q) || code.includes(q);
				item.style.display = match ? '' : 'none';
				if (match) sectionVisible++;
			});
			const heading = section.querySelector('h4');
			if (heading) heading.style.display = sectionVisible === 0 && q ? 'none' : '';
			totalVisible += sectionVisible;
		});
		let noResults = document.getElementById('search-no-results');
		if (q && totalVisible === 0) {
			if (!noResults) {
				noResults = document.createElement('div');
				noResults.id = 'search-no-results';
				noResults.className = 'search-no-results';
				noResults.textContent = 'No task sets match your search.';
				taskSetsContainer.appendChild(noResults);
			}
		} else if (noResults) {
			noResults.remove();
		}
	});
}



function showError(message) {
	const container = document.getElementById('task-sets-container');
	container.className = 'empty-state';
	container.innerHTML = `
	<i class="fas fa-exclamation-triangle text-danger"></i>
	<h4>Error Loading Task Sets</h4>
	<p>${escapeHtml(message || 'An unexpected error occurred. Please try again later.')}</p>
	`;
}

async function loadTaskSets() {
	try {
		const response = await fetch('/api/my_sets', { credentials: 'include' });
		if (!response.ok) {
			if (response.status === 401) {
				window.location.href = '/';
				return;
			}
			throw new Error('Failed to load task sets');
		}
		const data = await response.json();
		renderTaskSets(data);
	} catch (err) {
		console.error('Error loading task sets:', err);
		showError(err.message);
	}
}

function createMyTaskCard(task) {
	const card = document.createElement('div');
	card.className = 'task-set-item';
	card.style.cursor = 'pointer';
	card.onclick = () => {
		const previewWindow = window.open(
			'/task?id=' + encodeURIComponent(task.id),
			'_blank',
			'width=1000,height=800,resizable=yes,scrollbars=yes'
		);
		if (previewWindow) previewWindow.focus();
	};

	const header = document.createElement('div');
	header.className = 'task-set-item-top';

	const title = document.createElement('div');
	title.className = 'task-set-title';
	title.textContent = task.title;
	header.appendChild(title);
	card.appendChild(header);

	const meta = document.createElement('div');
	meta.className = 'task-set-meta';
	meta.textContent = `${task.task_type} · Created ${formatDate(task.created_at)}`;
	card.appendChild(meta);

	const actions = document.createElement('div');
	actions.className = 'd-flex flex-wrap mt-2';
	actions.style.gap = '0.5rem';

	if (task.editable) {
		const editBtn = document.createElement('a');
		editBtn.href = `/create-task-editor?task_id=${task.id}`;
		editBtn.className = 'btn btn-sm btn-outline-success';
		editBtn.innerHTML = '<i class="fas fa-pen"></i> Edit';
		actions.appendChild(editBtn);

		const deleteBtn = document.createElement('button');
		deleteBtn.className = 'btn btn-sm btn-outline-danger';
		deleteBtn.innerHTML = '<i class="fas fa-trash"></i> Delete';
		deleteBtn.addEventListener('click', async (e) => {
			e.stopPropagation();
			if (!confirm(`Delete "${task.title}"? This cannot be undone.`)) return;
			try {
				const res = await fetch(`/api/problems/${task.id}`, { method: 'DELETE', credentials: 'include' });
				if (res.ok) {
					card.remove();
				} else {
					const data = await res.json().catch(() => ({}));
					alert(data.detail || 'Failed to delete task.');
				}
			} catch (err) {
				console.error('Delete failed:', err);
				alert('Failed to delete task.');
			}
		});
		actions.appendChild(deleteBtn);
	} else {
		const lockedSpan = document.createElement('span');
		lockedSpan.className = 'btn btn-sm btn-secondary disabled';
		lockedSpan.title = 'This task is in use and cannot be edited or deleted';
		lockedSpan.innerHTML = '<i class="fas fa-lock"></i> In use';
		actions.appendChild(lockedSpan);
	}

	const statsBtn = document.createElement('a');
	statsBtn.href = `/task-statistics?id=${task.id}`;
	statsBtn.className = 'btn btn-sm btn-outline-primary';
	statsBtn.innerHTML = '<i class="fas fa-chart-line"></i>Global Statistics';
	actions.appendChild(statsBtn);

	card.appendChild(actions);
	return card;
}

function renderMyTasks(tasks) {
	const container = document.getElementById('your-tasks-container');
	if (!container) return;

	container.innerHTML = '';
	const section = document.createElement('div');
	section.className = 'task-set-section';

	const sectionHeader = document.createElement('div');
	sectionHeader.className = 'section-header-row';

	const heading = document.createElement('h4');
	heading.textContent = 'My Tasks';

	const createBtn = document.createElement('a');
	createBtn.href = '/create-task';
	createBtn.className = 'section-create-btn';
	createBtn.innerHTML = '<i class="fas fa-plus"></i> New Task';

	sectionHeader.appendChild(heading);
	sectionHeader.appendChild(createBtn);

	section.appendChild(sectionHeader);

	const searchBox = document.createElement('div');
	searchBox.className = 'search-box';
	searchBox.innerHTML = '<i class="fas fa-search"></i><input type="text" id="task-item-search" placeholder="Search tasks…" autocomplete="off">';
	section.appendChild(searchBox);

	if (tasks.length === 0) {
		const empty = document.createElement('p');
		empty.className = 'text-muted mb-0';
		empty.textContent = 'No tasks created yet.';
		section.appendChild(empty);
	} else {
		tasks.forEach((task) => section.appendChild(createMyTaskCard(task)));
	}

	container.appendChild(section);
	setupTaskSearch();
}

function setupTaskSearch() {
	const input = document.getElementById('task-item-search');
	if (!input) return;
	const tasksContainer = document.getElementById('your-tasks-container');
	input.addEventListener('input', () => {
		const q = input.value.trim().toLowerCase();
		let visible = 0;
		tasksContainer.querySelectorAll('.task-set-item').forEach(item => {
			const title = item.querySelector('.task-set-title')?.textContent.toLowerCase() ?? '';
			const meta = item.querySelector('.task-set-meta')?.textContent.toLowerCase() ?? '';
			const match = !q || title.includes(q) || meta.includes(q);
			item.style.display = match ? '' : 'none';
			if (match) visible++;
		});
		let noResults = document.getElementById('task-search-no-results');
		if (q && visible === 0) {
			if (!noResults) {
				noResults = document.createElement('div');
				noResults.id = 'task-search-no-results';
				noResults.className = 'search-no-results';
				noResults.textContent = 'No tasks match your search.';
				tasksContainer.appendChild(noResults);
			}
		} else if (noResults) {
			noResults.remove();
		}
	});
}

async function loadMyTasks() {
	try {
		const response = await fetch('/api/my_tasks', { credentials: 'include' });
		if (!response.ok) return;
		const tasks = await response.json();
		renderMyTasks(tasks);
	} catch (err) {
		console.error('Error loading tasks:', err);
	}
}

async function initPage() {
	await loadCurrentUser();
	await Promise.all([loadTaskSets(), loadMyTasks()]);
}

initPage();

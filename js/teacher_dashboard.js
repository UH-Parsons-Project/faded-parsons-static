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

function createAddButton() {
	const button = document.createElement('div');
	button.className = 'create-new-card';
	button.onclick = () => {
	window.location.href = '/create-task-set';
	};

	button.innerHTML = `
	<i class="fas fa-plus-circle"></i>
	<div class="task-set-title">Create New Task Set</div>
	<p class="mb-0">Add a new task set</p>
	`;

	return button;
}

function createNewTaskButton() {
	const wrapper = document.createElement('div');
	wrapper.className = 'mb-3';

	const link = document.createElement('a');
	link.href = '/create-task';
	link.className = 'btn btn-success btn-block';
	link.textContent = 'New task';

	wrapper.appendChild(link);
	return wrapper;
}


function renderTaskSets(taskSets) {
	const container = document.getElementById('task-sets-container');
	container.className = '';
	container.innerHTML = '';

	if (taskSets.length === 0) {
	container.innerHTML = `
		<div class="empty-state">
		<i class="fas fa-folder-open"></i>
		<h4>No Task Sets Yet</h4>
		<p>Create your first task set to get started with organizing exercises and viewing statistics.</p>
		</div>
	`;
	const buttonWrapper = document.createElement('div');
	buttonWrapper.style.maxWidth = '300px';
	buttonWrapper.style.margin = '0 auto';
	buttonWrapper.appendChild(createNewTaskButton());
	buttonWrapper.appendChild(createAddButton());

	container.appendChild(buttonWrapper);
	} else {
	const layout = document.createElement('div');
	layout.className = 'teacher-dashboard-layout';

	const listsColumn = document.createElement('div');
	listsColumn.className = 'task-sets-column';

	const searchBox = document.createElement('div');
	searchBox.className = 'search-box';
	searchBox.innerHTML = '<i class="fas fa-search"></i><input type="text" id="task-search" placeholder="Search task sets…" autocomplete="off">';
	listsColumn.appendChild(searchBox);

	const ownedLists = currentUsername
		? taskSets.filter(taskSet => taskSet.owner_username === currentUsername)
		: taskSets;
	const sharedLists = currentUsername
		? taskSets.filter(taskSet => taskSet.owner_username !== currentUsername)
		: [];

	const ownedSection = document.createElement('div');
	ownedSection.className = 'task-set-section';
	ownedSection.innerHTML = '<h4 class="mb-3">Your Task Sets</h4>';

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

	listsColumn.appendChild(ownedSection);
	listsColumn.appendChild(sharedSection);

	const addColumn = document.createElement('div');
	addColumn.className = 'add-button-column';
	addColumn.appendChild(createNewTaskButton());
	addColumn.appendChild(createAddButton());


	layout.appendChild(listsColumn);
	layout.appendChild(addColumn);
	container.appendChild(layout);
	setupSearch();
	}
}

function setupSearch() {
	const input = document.getElementById('task-search');
	if (!input) return;
	input.addEventListener('input', () => {
		const q = input.value.trim().toLowerCase();
		let totalVisible = 0;
		document.querySelectorAll('.task-set-section').forEach(section => {
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
				document.querySelector('.task-sets-column')?.appendChild(noResults);
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

async function initPage() {
	await loadCurrentUser();
	await loadTaskSets();
}

initPage();

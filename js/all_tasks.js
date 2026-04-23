import {initNavbarExercisesButton, initSignedInAs, initProtectedPage, initBurgerMenu} from '/js/auth-ui.js';

initSignedInAs();

initNavbarExercisesButton();

initProtectedPage('/');

initBurgerMenu();

// Load exercise list
const container = document.getElementById('problems-list');
const filterToggleBtn = document.getElementById('task-filter-toggle');
const filterPanel = document.getElementById('task-filter-panel');
const taskSearchInput = document.getElementById('task-search');
const scopeCheckboxes = document.querySelectorAll('.filter-scope');

let allTasks = [];
let currentTeacherId = null;
let currentTeacherUsername = '';

const activeTaskFilters = {
	query: '',
	activeScope: null
};

function formatDate(isoString) {
	if (!isoString) return '';
	const date = new Date(isoString);
	return date.toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	});
}

function truncate(text, maxLength) {
	if (!text) return '';
	if (text.length <= maxLength) return text;
	return text.slice(0, maxLength) + '...';
}

function formatSuccessRateText(stats) {
	const studentsAttempted = Number(stats.students_attempted || 0);
	const studentsCompleted = Number(stats.students_completed || 0);

	if (!studentsAttempted) {
		return 'Success rate: No attempts yet';
	}

	const rate = (studentsCompleted / studentsAttempted) * 100;
	return (
		'Success rate: ' +
		rate.toFixed(0) +
		'% (' +
		studentsCompleted +
		'/' +
		studentsAttempted +
		' students)'
	);
}

async function loadSuccessRate(taskId, targetElement) {
	targetElement.textContent = 'Success rate: Loading...';

	try {
		const response = await fetch('/api/tasks/' + encodeURIComponent(taskId) + '/statistics', {
			credentials: 'include'
		});

		if (!response.ok) {
			throw new Error('Failed to load statistics');
		}

		const stats = await response.json();
		targetElement.textContent = formatSuccessRateText(stats);
	} catch {
		targetElement.textContent = 'Success rate: Unavailable';
	}
}

function createExerciseCard(item) {
	const card = document.createElement('div');
	card.className = 'task-set-item';
	card.onclick = () => {
		window.location.href = '/task-statistics?id=' + encodeURIComponent(item.id);
	};

	const header = document.createElement('div');
	header.className = 'task-set-item-header';

	const title = document.createElement('div');
	title.className = 'task-set-title';
	title.textContent = item.title;
	header.appendChild(title);

	const favoriteBtn = document.createElement('button');
	favoriteBtn.type = 'button';
	favoriteBtn.className = 'task-favorite-button' + (item.is_favorite ? ' is-favorite' : '');
	favoriteBtn.innerHTML = item.is_favorite ? '<i class="fas fa-star"></i>' : '<i class="far fa-star"></i>';
	favoriteBtn.title = item.is_favorite ? 'Remove from favorites' : 'Add to favorites';
	favoriteBtn.setAttribute('aria-label', favoriteBtn.title);
	favoriteBtn.addEventListener('click', async (e) => {
		e.preventDefault();
		e.stopPropagation();
		try {
			await toggleFavorite(item);
		} catch (error) {
			console.error('Failed to update favorite:', error);
			alert('Could not update favorite right now.');
		}
	});
	header.appendChild(favoriteBtn);
	card.appendChild(header);

	const meta = document.createElement('div');
	meta.className = 'task-set-meta';

	const metaParts = ['View global statistics (anonymous)'];
	if (item.task_type) {
		metaParts.push(item.task_type);
	}
	if (item.creator_username) {
		metaParts.push('Teacher ' + item.creator_username);
	}
	if (item.created_at) {
		metaParts.push('Created ' + formatDate(item.created_at));
	}
	meta.textContent = metaParts.join(' - ');

	card.appendChild(meta);

	const successRate = document.createElement('div');
	successRate.className = 'task-set-meta';
	successRate.textContent = 'Success rate: Loading...';
	card.appendChild(successRate);

	loadSuccessRate(item.id, successRate);

	const teaserText = item.task_instructions || item.description;
	if (teaserText) {
		const teaser = document.createElement('div');
		teaser.className = 'task-set-description';
		teaser.textContent = truncate(teaserText, 160);
		teaser.title = teaserText;
		card.appendChild(teaser);
	}

	const actions = document.createElement('div');
	actions.className = 'd-flex flex-wrap mt-2';
	actions.style.gap = '0.5rem';

	const statsBtn = document.createElement('button');
	statsBtn.type = 'button';
	statsBtn.className = 'btn btn-sm btn-outline-primary';
	statsBtn.innerHTML = '<i class="fas fa-chart-line"></i> Global Statistics';
	statsBtn.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		window.location.href = '/task-statistics?id=' + encodeURIComponent(item.id);
	});

	const previewBtn = document.createElement('button');
	previewBtn.type = 'button';
	previewBtn.className = 'btn btn-sm btn-outline-secondary';
	previewBtn.innerHTML = '<i class="fas fa-eye"></i> Preview';
	previewBtn.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		const previewWindow = window.open(
			'/task?id=' + encodeURIComponent(item.id),
			'_blank',
			'width=1000,height=800,resizable=yes,scrollbars=yes'
		);
		if (previewWindow) {
			previewWindow.focus();
		}
	});

	actions.appendChild(statsBtn);
	actions.appendChild(previewBtn);
	card.appendChild(actions);

	return card;
}

async function toggleFavorite(task) {
	const shouldFavorite = !task.is_favorite;
	const response = await fetch('/api/tasks/' + encodeURIComponent(task.id) + '/favorite', {
		method: shouldFavorite ? 'POST' : 'DELETE',
		credentials: 'include'
	});

	if (!response.ok) {
		throw new Error('Failed to update favorite');
	}

	const result = await response.json();
	task.is_favorite = Boolean(result.is_favorite);
	applyTaskFilters();
}

function render(list) {
	container.className = '';
	container.innerHTML = '';

	if (!list.length) {
		container.className = 'empty-state';
		container.innerHTML = `
			<i class="fas fa-folder-open"></i>
			<h4>No Exercises Found</h4>
			<p>There are no public exercises available right now.</p>
		`;
		return;
	}

	const cardsColumn = document.createElement('div');
	cardsColumn.className = 'task-sets-column';

	list.forEach(function (item) {
		cardsColumn.appendChild(createExerciseCard(item));
	});

	container.appendChild(cardsColumn);
}

function toggleFilterPanel() {
	if (!filterPanel || !filterToggleBtn) return;
	const isExpanded = filterPanel.classList.contains('show');
	filterPanel.classList.toggle('show', !isExpanded);
	filterToggleBtn.setAttribute('aria-expanded', String(!isExpanded));
}

function setupFilterUi() {
	if (filterToggleBtn) {
		filterToggleBtn.addEventListener('click', toggleFilterPanel);
	}

	if (taskSearchInput) {
		taskSearchInput.addEventListener('input', (e) => {
			activeTaskFilters.query = e.target.value.trim().toLowerCase();
			applyTaskFilters();
		});
	}

	scopeCheckboxes.forEach((checkbox) => {
		checkbox.addEventListener('change', (e) => {
			if (e.target.checked) {
				scopeCheckboxes.forEach((other) => {
					if (other !== e.target) {
						other.checked = false;
					}
				});
				activeTaskFilters.activeScope = e.target.value;
			} else {
				activeTaskFilters.activeScope = null;
			}
			applyTaskFilters();
		});
	});
}

function isOwnTask(task, creatorUsername) {
	const byTeacherId =
		currentTeacherId !== null && Number(task.created_by_teacher_id) === currentTeacherId;
	const byTeacherName =
		!!currentTeacherUsername && creatorUsername === currentTeacherUsername.toLowerCase();
	return byTeacherId || byTeacherName;
}

function applyTaskFilters() {
	const query = activeTaskFilters.query;
	const activeScope = activeTaskFilters.activeScope;

	const filteredTasks = allTasks.filter((task) => {
		const taskTitle = (task.title || '').toLowerCase();
		const taskType = (task.task_type || '').toLowerCase();
		const creatorUsername = (task.creator_username || '').toLowerCase();
		const ownTask = isOwnTask(task, creatorUsername);

		if (!query) {
			if (activeScope === 'my-exercises') {
				return ownTask;
			}
			if (activeScope === 'favorites') {
				return Boolean(task.is_favorite);
			}
			return true;
		}

		if (!activeScope) {
			return (
				taskTitle.includes(query) ||
				taskType.includes(query) ||
				creatorUsername.includes(query)
			);
		}

		if (activeScope === 'title') {
			return taskTitle.includes(query);
		}
		if (activeScope === 'type') {
			return taskType.includes(query);
		}
		if (activeScope === 'teacher') {
			return creatorUsername.includes(query);
		}
		if (activeScope === 'my-exercises') {
			return ownTask && (taskTitle.includes(query) || taskType.includes(query));
		}
		if (activeScope === 'favorites') {
			return Boolean(task.is_favorite) && (
				taskTitle.includes(query) ||
				taskType.includes(query) ||
				creatorUsername.includes(query)
			);
		}

		return false;
	});

	filteredTasks.sort((a, b) => {
		const titleA = (a.title || '').toLowerCase();
		const titleB = (b.title || '').toLowerCase();
		return titleA.localeCompare(titleB);
	});

	render(filteredTasks);
}

function loadCurrentTeacher() {
	const storedUsername = localStorage.getItem('username');
	const storedUserId = localStorage.getItem('userId');

	if (storedUsername) {
		currentTeacherUsername = storedUsername;
	}

	if (storedUserId) {
		const parsedId = Number.parseInt(storedUserId, 10);
		if (!Number.isNaN(parsedId)) {
			currentTeacherId = parsedId;
		}
	}

	fetch('/api/me', { credentials: 'include' })
		.then((r) => (r.ok ? r.json() : Promise.reject()))
		.then((data) => {
			if (data?.username) {
				currentTeacherUsername = data.username;
				localStorage.setItem('username', data.username);
			}
			if (typeof data?.id === 'number') {
				currentTeacherId = data.id;
				localStorage.setItem('userId', String(data.id));
			}
			applyTaskFilters();
		})
		.catch(() => {
			// Keep cached identity when /api/me is unavailable.
		});
}

setupFilterUi();
loadCurrentTeacher();

// Fetch problems list
	fetch('/api/tasks', { credentials: 'include' })
	.then(function (resp) {
		if (!resp.ok) throw new Error('Network response not ok');
		return resp.json();
	})
	.then(function (json) {
		allTasks = json;
		applyTaskFilters();
	})
	.catch(function () {
		container.className = 'empty-state';
		container.innerHTML = `
			<i class="fas fa-exclamation-triangle text-danger"></i>
			<h4>Error Loading Exercises</h4>
			<p>Unable to load exercise list.</p>
		`;
	});

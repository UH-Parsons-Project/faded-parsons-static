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

	const title = document.createElement('div');
	title.className = 'task-set-title';
	title.textContent = item.title;

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

	card.appendChild(title);
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

	return card;
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
fetch('/api/tasks')
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

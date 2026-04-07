import {initNavbarExercisesButton, initSignedInAs, initProtectedPage} from '/js/auth-ui.js';

initSignedInAs();

initNavbarExercisesButton();

initProtectedPage('/');

// Load exercise list
const container = document.getElementById('problems-list');

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

	const metaParts = ['View global analytics'];
	if (item.task_type) {
		metaParts.push(item.task_type);
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

// Fetch problems list
fetch('/api/tasks')
	.then(function (resp) {
		if (!resp.ok) throw new Error('Network response not ok');
		return resp.json();
	})
	.then(function (json) {
		render(json);
	})
	.catch(function () {
		container.className = 'empty-state';
		container.innerHTML = `
			<i class="fas fa-exclamation-triangle text-danger"></i>
			<h4>Error Loading Exercises</h4>
			<p>Unable to load exercise list.</p>
		`;
	});

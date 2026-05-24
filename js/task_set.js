import { initStudentLogout, initSignedInAs, initNavbarExercisesButton } from '/js/auth-ui.js';

initSignedInAs({ preferNickname: true });

initStudentLogout();

initNavbarExercisesButton();

// Load problem list for this task_set
const container = document.getElementById('problems-list');
const pathParts = window.location.pathname.split('/');
const uniqueLinkCode = pathParts[2]; // /set/{unique_link_code}/tasks

let tasksList = [];

async function loadProblemsetInfo() {
	try {
		const response = await fetch(`/api/my_sets/${uniqueLinkCode}/info`);
		if (!response.ok) {
			return;
		}
		const info = await response.json();

		// Update title
		const titleElement = document.querySelector('h2.mb-3');
		if (titleElement) {
			titleElement.textContent = info.title;
		}

		// Update description in info section
		const infoSection = document.getElementById('info-section');
		if (infoSection && info.student_description) {
			infoSection.innerHTML = '';

			const heading = document.createElement('h6');
			heading.className = 'info-heading';
			heading.textContent = 'About These Tasks';
			infoSection.appendChild(heading);

			const description = document.createElement('p');
			description.className = 'info-description';
			description.textContent = info.student_description;
			infoSection.appendChild(description);
		}
	} catch (error) {
		console.error('Failed to load task_set info:', error);
	}
}

async function loadCompletionStatus(taskNumber, statusElement, itemIndex, numberElement) {
  try {
		const encodedTaskNumber = encodeURIComponent(taskNumber);
		const [completionResponse, startedResponse] = await Promise.all([
			fetch(`/api/sets/${uniqueLinkCode}/tasks/${encodedTaskNumber}/my-completion-status`, {
        credentials: 'include'
      }),
			fetch(`/api/sets/${uniqueLinkCode}/tasks/${encodedTaskNumber}/has-started`, {
        credentials: 'include'
      }),
    ]);

    if (!completionResponse.ok || !startedResponse.ok) {
      return;
    }

		const stats = await completionResponse.json();
		const startedData = await startedResponse.json();
		const hasStarted = Boolean(startedData.has_started);
		const studentCompleted = Number(stats.student_completed || 0);

		if (studentCompleted > 0) {
			statusElement.className = 'task-set-meta task-completed';
			statusElement.innerHTML = '<i class="fas fa-check-circle"></i>Completed';
			if (numberElement) numberElement.classList.add('completed');
			tasksList[itemIndex].isCompleted = true;
		} else if (hasStarted) {
			statusElement.className = 'task-set-meta task-in-progress';
			statusElement.innerHTML = '<i class="fas fa-clock"></i>In Progress';
			tasksList[itemIndex].isCompleted = false;
		} else {
			tasksList[itemIndex].isCompleted = false;
		}

		updateProgressBar(tasksList);
	} catch (error) {
		console.error('Failed to load completion status:', error);
		tasksList[itemIndex].isCompleted = false;
		updateProgressBar(tasksList);
	}
}

function createTaskCard(item, index) {
	const card = document.createElement('div');
	card.className = 'task-set-item';
	const taskNumber = index + 1;
	card.onclick = () => {
		window.location.href = `/set/${uniqueLinkCode}/tasks/${taskNumber}/start`;
	};

	const number = document.createElement('div');
	number.className = 'task-set-item-number';
	number.textContent = index + 1;
	card.appendChild(number);

	const body = document.createElement('div');
	body.className = 'task-set-item-body';

	const title = document.createElement('div');
	title.className = 'task-set-title';
	title.textContent = item.title;
	body.appendChild(title);

	const status = document.createElement('div');
	status.className = 'task-set-meta';
	status.style.minHeight = '1.5rem';
	body.appendChild(status);

	card.appendChild(body);

	const chevron = document.createElement('i');
	chevron.className = 'fas fa-chevron-right task-set-item-chevron';
	card.appendChild(chevron);

	loadCompletionStatus(taskNumber, status, index, number);

	return card;
}

function updateProgressBar(list) {
	const totalCount = list.length;
	const completedCount = list.filter(item => item.isCompleted).length;
	const percentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

	document.getElementById('total-count').textContent = totalCount;
	document.getElementById('completed-count').textContent = completedCount;
	document.getElementById('progress-bar').style.width = percentage + '%';
	document.getElementById('progress-bar').setAttribute('aria-valuenow', percentage);
	document.getElementById('progress-bar').textContent = percentage > 10 ? Math.round(percentage) + '%' : '';
}

function render(list) {
	container.className = '';
	container.innerHTML = '';

	tasksList = list.map(item => ({ ...item, isCompleted: false }));

	if (!list.length) {
		container.className = 'empty-state';
		container.innerHTML = `
			<i class="fas fa-tasks"></i>
			<h4>No Tasks Found</h4>
			<p>There are no tasks in this set right now.</p>
		`;
		updateProgressBar(list);
		return;
	}

	const cardsColumn = document.createElement('div');
	cardsColumn.className = 'task-sets-column';

	list.forEach(function (item, index) {
		cardsColumn.appendChild(createTaskCard(item, index));
	});

	container.appendChild(cardsColumn);
	updateProgressBar(tasksList);
}

if (uniqueLinkCode) {
	fetch(`/api/sets/${uniqueLinkCode}/is-enrolled`, { credentials: 'include' })
		.then(r => r.ok ? r.json() : { enrolled: false })
		.then(data => {
			if (!data.enrolled) {
				window.location.href = `/set/${uniqueLinkCode}`;
				return;
			}

			// Load task_set info (title and description)
			loadProblemsetInfo();

			// Fetch problems for this task_set
			fetch(`/api/my_sets/${uniqueLinkCode}/tasks`)
				.then(function (resp) {
					if (!resp.ok) throw new Error('Network response not ok');
					return resp.json();
				})
				.then(function (json) {
					render(json.filter(t => !t.is_hidden));
				})
				.catch(function (error) {
					container.className = 'empty-state';
					container.innerHTML = `
						<i class="fas fa-exclamation-triangle text-danger"></i>
						<h4>Error Loading Tasks</h4>
						<p>Unable to load task set.</p>
					`;
					console.error(error);
				});
		})
		.catch(function (error) {
			console.error('Enrollment check failed:', error);
			window.location.href = `/set/${uniqueLinkCode}`;
		});
} else {
	container.className = 'empty-state';
	container.innerHTML = `
		<i class="fas fa-exclamation-circle text-warning"></i>
		<h4>Task Set Not Found</h4>
		<p>The task set you are looking for does not exist.</p>
	`;
}

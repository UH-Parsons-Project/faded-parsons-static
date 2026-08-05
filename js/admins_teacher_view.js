import {initProtectedPage, initSignedInAs, initBurgerMenu} from '/js/auth-ui.js';
import {createPrivateBadge, isPrivateTask} from '/js/privacy-badge.js';

initProtectedPage('/');
initSignedInAs();
initBurgerMenu();

const urlParams = new URLSearchParams(window.location.search);
const teacherId = parseInt(urlParams.get('teacher_id'), 10);

if (isNaN(teacherId)) {
	alert('Invalid Teacher ID');
	window.location.href = '/all-users';
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
	if (!text) return '';
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}

function makeKeyActivatable(el, handler) {
	el.setAttribute('tabindex', '0');
	el.setAttribute('role', 'button');
	el.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			handler(e);
		}
	});
}

// Dom elements
const overviewUsername = document.getElementById('overview-username');
const overviewEmail = document.getElementById('overview-email');
const overviewId = document.getElementById('overview-id');
const overviewRegistered = document.getElementById('overview-registered');
const overviewSetsCount = document.getElementById('overview-sets-count');
const overviewTasksCount = document.getElementById('overview-tasks-count');
const pageTitle = document.getElementById('page-title');

const setsContainer = document.getElementById('task-sets-list-container');
const tasksContainer = document.getElementById('tasks-list-container');

const setsSearchInput = document.getElementById('sets-search');
const tasksSearchInput = document.getElementById('tasks-search');

let teacherSets = [];
let teacherTasks = [];

function createTaskSetItem(taskSet) {
	const item = document.createElement('div');
	item.className = 'task-set-item';
	const navigateToSet = () => { window.location.href = `/task-set-overview?set_id=${taskSet.id}`; };
	item.onclick = navigateToSet;
	makeKeyActivatable(item, navigateToSet);

	// Top row: title + join code chip
	const topRow = document.createElement('div');
	topRow.className = 'task-set-item-top';

	const titleWrap = document.createElement('div');
	titleWrap.style.display = 'flex';
	titleWrap.style.alignItems = 'center';
	titleWrap.style.gap = '.45rem';
	titleWrap.style.minWidth = '0';

	const title = document.createElement('div');
	title.className = 'task-set-title';
	title.textContent = taskSet.title;
	titleWrap.appendChild(title);

	if (isPrivateTask(taskSet)) {
		titleWrap.appendChild(createPrivateBadge());
	}

	topRow.appendChild(titleWrap);

	if (taskSet.unique_link_code) {
		const chip = document.createElement('div');
		chip.className = 'task-set-code-chip';
		chip.title = 'Click to copy link';
		chip.innerHTML = `<i class="far fa-copy"></i>${taskSet.unique_link_code}`;
		const copyLink = (e) => {
			e.stopPropagation();
			const url = `${window.location.protocol}//${window.location.host}/${encodeURIComponent(taskSet.owner_username || '')}/set/${encodeURIComponent(taskSet.unique_link_code)}`;
			navigator.clipboard.writeText(url).then(() => {
				chip.classList.add('copied');
				chip.innerHTML = `<i class="fas fa-check"></i>${taskSet.unique_link_code}`;
				setTimeout(() => {
					chip.classList.remove('copied');
					chip.innerHTML = `<i class="far fa-copy"></i>${taskSet.unique_link_code}`;
				}, 1500);
			});
		};
		chip.onclick = copyLink;
		makeKeyActivatable(chip, copyLink);
		topRow.appendChild(chip);
	}

	item.appendChild(topRow);

	const meta = document.createElement('div');
	meta.className = 'task-set-meta';
	const expiryPart = taskSet.expires_at
		? `<div style="margin-bottom: 0.2rem;"><i class="far fa-clock"></i> Expires ${formatDate(taskSet.expires_at)}</div>`
		: '';
	meta.innerHTML = `
		<div style="margin-bottom: 0.2rem;"><i class="far fa-calendar"></i> Created ${formatDate(taskSet.created_at)}</div>
		${expiryPart}
		<div style="margin-bottom: 0.2rem;"><i class="fas fa-tasks"></i> ${taskSet.task_count} task${taskSet.task_count !== 1 ? 's' : ''}</div>
		<div><i class="fas fa-user-graduate"></i> ${taskSet.student_count} student${taskSet.student_count !== 1 ? 's' : ''} joined</div>
	`;
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

function createTaskItem(task) {
	const card = document.createElement('div');
	card.className = 'task-set-item';
	card.style.cursor = 'pointer';
	const openPreview = () => {
		const previewWindow = window.open(
			'/task?id=' + encodeURIComponent(task.id),
			'_blank',
			'width=1000,height=800,resizable=yes,scrollbars=yes'
		);
		if (previewWindow) previewWindow.focus();
	};
	card.onclick = openPreview;
	makeKeyActivatable(card, openPreview);

	const header = document.createElement('div');
	header.className = 'task-set-item-top';

	const titleWrap = document.createElement('div');
	titleWrap.style.display = 'flex';
	titleWrap.style.alignItems = 'center';
	titleWrap.style.gap = '.45rem';
	titleWrap.style.minWidth = '0';

	const title = document.createElement('div');
	title.className = 'task-set-title';
	title.textContent = task.title;
	titleWrap.appendChild(title);

	if (isPrivateTask(task)) {
		titleWrap.appendChild(createPrivateBadge());
	}

	header.appendChild(titleWrap);
	card.appendChild(header);

	const meta = document.createElement('div');
	meta.className = 'task-set-meta';
	meta.innerHTML = `
		<div style="margin-bottom: 0.2rem;"><i class="fas fa-code-branch"></i> Type: ${task.task_type}</div>
		<div><i class="far fa-calendar-alt"></i> Created: ${formatDate(task.created_at)}</div>
	`;
	card.appendChild(meta);

	if (task.description) {
		const description = document.createElement('div');
		description.className = 'task-set-description';
		description.textContent = task.description;
		card.appendChild(description);
	}

	return card;
}

function renderTaskSets() {
	setsContainer.className = '';
	setsContainer.innerHTML = '';

	const query = setsSearchInput.value.trim().toLowerCase();
	const filtered = teacherSets.filter(ts => {
		const title = (ts.title || '').toLowerCase();
		const code = (ts.unique_link_code || '').toLowerCase();
		return !query || title.includes(query) || code.includes(query);
	});

	if (filtered.length === 0) {
		setsContainer.innerHTML = '<div class="empty-state"><i class="fas fa-folder-open"></i><p>No matching task sets.</p></div>';
		return;
	}

	filtered.forEach(ts => {
		setsContainer.appendChild(createTaskSetItem(ts));
	});
}

function renderTasks() {
	tasksContainer.className = '';
	tasksContainer.innerHTML = '';

	const query = tasksSearchInput.value.trim().toLowerCase();
	const filtered = teacherTasks.filter(t => {
		const title = (t.title || '').toLowerCase();
		const type = (t.task_type || '').toLowerCase();
		return !query || title.includes(query) || type.includes(query);
	});

	if (filtered.length === 0) {
		tasksContainer.innerHTML = '<div class="empty-state"><i class="fas fa-tasks"></i><p>No matching tasks.</p></div>';
		return;
	}

	filtered.forEach(t => {
		tasksContainer.appendChild(createTaskItem(t));
	});
}

async function loadData() {
	try {
		// 1. Fetch users, all tasksets, and tasks
		const [usersRes, setsRes, tasksRes] = await Promise.all([
			fetch('/api/admin/users', { credentials: 'include' }),
			fetch('/api/all-tasksets', { credentials: 'include' }),
			fetch('/api/tasks', { credentials: 'include' })
		]);

		if (!usersRes.ok || !setsRes.ok || !tasksRes.ok) {
			throw new Error('Failed to load details from the database.');
		}

		const allUsers = await usersRes.json();
		const allSets = await setsRes.json();
		const allTasks = await tasksRes.json();

		// 2. Find teacher details
		const teacher = allUsers.find(u => u.role === 'teacher' && u.id === teacherId);
		if (!teacher) {
			throw new Error('Teacher user not found.');
		}

		// 3. Populate Overview
		pageTitle.textContent = `Teacher Profile: ${teacher.username}`;
		overviewUsername.textContent = teacher.username;
		overviewEmail.textContent = teacher.email;
		overviewId.textContent = teacher.id;
		overviewRegistered.textContent = formatDate(teacher.created_at);

		// 4. Filter lists by teacher
		teacherSets = allSets.filter(ts => ts.owner_username === teacher.username || ts.teacher_id === teacher.id);
		teacherTasks = allTasks.filter(t => t.creator_username === teacher.username || t.created_by_teacher_id === teacher.id);

		// Update overview counts
		overviewSetsCount.textContent = `${teacherSets.length} task set${teacherSets.length !== 1 ? 's' : ''}`;
		overviewTasksCount.textContent = `${teacherTasks.length} task${teacherTasks.length !== 1 ? 's' : ''}`;

		// 5. Render lists
		renderTaskSets();
		renderTasks();

	} catch (err) {
		console.error(err);
		setsContainer.innerHTML = `<p class="text-danger p-3">Error: ${escapeHtml(err.message)}</p>`;
		tasksContainer.innerHTML = `<p class="text-danger p-3">Error: ${escapeHtml(err.message)}</p>`;
	}
}

// Search Listeners
setsSearchInput.addEventListener('input', renderTaskSets);
tasksSearchInput.addEventListener('input', renderTasks);

loadData();

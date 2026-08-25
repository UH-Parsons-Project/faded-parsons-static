import {initProtectedPage, initSignedInAs, initBurgerMenu} from '../core/auth-ui.js';
import { formatDate } from '../utils/ui-utils.js';

initProtectedPage('/');
initSignedInAs();
initBurgerMenu();

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


// ==================== Statistics ====================

function createChart(canvasId, dailyData, barColor = '#007bff') {
	const canvas = document.getElementById(canvasId);
	if (!canvas) return;

	const ctx = canvas.getContext('2d');
	const width = canvas.width;
	const height = canvas.height;

	if (dailyData.length === 0) {
		ctx.fillStyle = '#ccc';
		ctx.font = '14px sans-serif';
		ctx.textAlign = 'center';
		ctx.fillText('No data available', width / 2, height / 2);
		return;
	}

	const maxValue = Math.max(...dailyData.map(d => d.active_users), 1);
	const paddingLeft = 50;
	const paddingRight = 20;
	const paddingBottom = 50;
	const paddingTop = 20;
	const chartWidth = width - paddingLeft - paddingRight;
	const chartHeight = height - paddingBottom - paddingTop;

	const slotWidth = chartWidth / dailyData.length;
	const barWidth = Math.min(slotWidth * 0.7, 50);

	// Clear canvas
	ctx.fillStyle = '#fff';
	ctx.fillRect(0, 0, width, height);

	// Draw grid lines
	ctx.strokeStyle = '#f0f0f0';
	ctx.lineWidth = 1;
	const gridLines = 5;
	for (let i = 0; i <= gridLines; i++) {
		const y = paddingTop + (i / gridLines) * chartHeight;
		ctx.beginPath();
		ctx.moveTo(paddingLeft, y);
		ctx.lineTo(width - paddingRight, y);
		ctx.stroke();
	}

	// Draw axes
	ctx.strokeStyle = '#333';
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.moveTo(paddingLeft, paddingTop);
	ctx.lineTo(paddingLeft, height - paddingBottom);
	ctx.lineTo(width - paddingRight, height - paddingBottom);
	ctx.stroke();

	// Draw bars
	dailyData.forEach((d, i) => {
		const barHeight = (d.active_users / maxValue) * chartHeight;
		const x = paddingLeft + i * slotWidth + (slotWidth - barWidth) / 2;
		const y = height - paddingBottom - barHeight;

		// Draw bar
		ctx.fillStyle = barColor;
		ctx.fillRect(x, y, barWidth, barHeight);

		// Draw border
		ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
		ctx.lineWidth = 1;
		ctx.strokeRect(x, y, barWidth, barHeight);

		// Draw value on bar
		ctx.fillStyle = '#333';
		ctx.font = 'bold 12px sans-serif';
		ctx.textAlign = 'center';
		ctx.fillText(d.active_users.toString(), x + barWidth / 2, y - 5);
	});

	// Draw date labels
	ctx.fillStyle = '#666';
	ctx.font = '11px sans-serif';
	ctx.textAlign = 'center';

	dailyData.forEach((d, i) => {
		const x = paddingLeft + i * slotWidth + slotWidth / 2;
		const dateObj = new Date(d.date);
		const label = dateObj.getDate();
		ctx.fillText(label.toString(), x, height - paddingBottom + 20);
	});

	// Draw y-axis labels
	ctx.fillStyle = '#888';
	ctx.font = '10px sans-serif';
	ctx.textAlign = 'right';
	for (let i = 0; i <= gridLines; i++) {
		const value = Math.round((i / gridLines) * maxValue);
		const y = height - paddingBottom - (i / gridLines) * chartHeight;
		ctx.fillText(value.toString(), paddingLeft - 10, y + 4);
	}
}

function createMonthlyChart(canvasId, monthlyData, barColor = '#007bff') {
	const canvas = document.getElementById(canvasId);
	if (!canvas) return;

	const ctx = canvas.getContext('2d');
	const width = canvas.width;
	const height = canvas.height;

	// Show only last 6 months
	const data = monthlyData.slice(0, 6).reverse();

	if (data.length === 0) {
		ctx.fillStyle = '#ccc';
		ctx.font = '14px sans-serif';
		ctx.textAlign = 'center';
		ctx.fillText('No data available', width / 2, height / 2);
		return;
	}

	const maxValue = Math.max(...data.map(d => d.active_users), 1);
	const paddingLeft = 50;
	const paddingRight = 20;
	const paddingBottom = 50;
	const paddingTop = 20;
	const chartWidth = width - paddingLeft - paddingRight;
	const chartHeight = height - paddingBottom - paddingTop;

	const slotWidth = chartWidth / data.length;
	const barWidth = Math.min(slotWidth * 0.7, 50);

	// Clear canvas
	ctx.fillStyle = '#fff';
	ctx.fillRect(0, 0, width, height);

	// Draw grid lines
	ctx.strokeStyle = '#f0f0f0';
	ctx.lineWidth = 1;
	const gridLines = 5;
	for (let i = 0; i <= gridLines; i++) {
		const y = paddingTop + (i / gridLines) * chartHeight;
		ctx.beginPath();
		ctx.moveTo(paddingLeft, y);
		ctx.lineTo(width - paddingRight, y);
		ctx.stroke();
	}

	// Draw axes
	ctx.strokeStyle = '#333';
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.moveTo(paddingLeft, paddingTop);
	ctx.lineTo(paddingLeft, height - paddingBottom);
	ctx.lineTo(width - paddingRight, height - paddingBottom);
	ctx.stroke();

	// Draw bars
	data.forEach((d, i) => {
		const barHeight = (d.active_users / maxValue) * chartHeight;
		const x = paddingLeft + i * slotWidth + (slotWidth - barWidth) / 2;
		const y = height - paddingBottom - barHeight;

		// Draw bar
		ctx.fillStyle = barColor;
		ctx.fillRect(x, y, barWidth, barHeight);

		// Draw border
		ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
		ctx.lineWidth = 1;
		ctx.strokeRect(x, y, barWidth, barHeight);

		// Draw value on bar
		ctx.fillStyle = '#333';
		ctx.font = 'bold 12px sans-serif';
		ctx.textAlign = 'center';
		ctx.fillText(d.active_users.toString(), x + barWidth / 2, y - 5);
	});

	// Draw month labels
	ctx.fillStyle = '#666';
	ctx.font = '10px sans-serif';
	ctx.textAlign = 'center';

	data.forEach((d, i) => {
		const x = paddingLeft + i * slotWidth + slotWidth / 2;
		const monthLabel = d.month.substring(5); // Get MM from YYYY-MM
		ctx.fillText(monthLabel, x, height - paddingBottom + 20);
	});

	// Draw y-axis labels
	ctx.fillStyle = '#888';
	ctx.font = '10px sans-serif';
	ctx.textAlign = 'right';
	for (let i = 0; i <= gridLines; i++) {
		const value = Math.round((i / gridLines) * maxValue);
		const y = height - paddingBottom - (i / gridLines) * chartHeight;
		ctx.fillText(value.toString(), paddingLeft - 10, y + 4);
	}
}

function loadStatistics() {
	fetch('/api/admin/statistics/user-activity', { credentials: 'include' })
		.then(r => {
			if (!r.ok) throw new Error('Failed to load statistics');
			return r.json();
		})
		.then(data => {
			// Students stats
			const studentDailyTotal = data.students.daily_breakdown_last_7_days.reduce((sum, d) => sum + d.active_users, 0);
			document.getElementById('stat-active-7d-students').textContent = studentDailyTotal;
			const studentMonthlyTotal = data.students.monthly_breakdown.reduce((sum, m) => sum + m.active_users, 0);
			document.getElementById('stat-avg-monthly-students').textContent = studentMonthlyTotal;
			document.getElementById('stat-registered-students').textContent = data.students.registered_total;

			// Teachers stats
			const teacherDailyTotal = data.teachers.daily_breakdown_last_7_days.reduce((sum, d) => sum + d.active_users, 0);
			document.getElementById('stat-active-7d-teachers').textContent = teacherDailyTotal;
			const teacherMonthlyTotal = data.teachers.monthly_breakdown.reduce((sum, m) => sum + m.active_users, 0);
			document.getElementById('stat-avg-monthly-teachers').textContent = teacherMonthlyTotal;
			document.getElementById('stat-registered-teachers').textContent = data.teachers.registered_total;

			// Create daily charts (reverse data so oldest is on the left)
			const studentDailyReversed = [...data.students.daily_breakdown_last_7_days].reverse();
			const teacherDailyReversed = [...data.teachers.daily_breakdown_last_7_days].reverse();
			createChart('student-activity-chart', studentDailyReversed, '#28a745');
			createChart('teacher-activity-chart', teacherDailyReversed, '#ffc107');

			// Create monthly charts if canvases exist
			const monthlyStudentChart = document.getElementById('student-monthly-chart');
			const monthlyTeacherChart = document.getElementById('teacher-monthly-chart');
			if (monthlyStudentChart) {
				createMonthlyChart('student-monthly-chart', data.students.monthly_breakdown, '#28a745');
			}
			if (monthlyTeacherChart) {
				createMonthlyChart('teacher-monthly-chart', data.teachers.monthly_breakdown, '#ffc107');
			}
		})
		.catch(err => {
			console.error('Error loading statistics:', err);
			document.querySelectorAll('[id^="stat-"]').forEach(el => {
				el.textContent = '—';
			});
		});

	// Total task sets
	fetch('/api/all-tasksets', { credentials: 'include' })
		.then(r => r.ok ? r.json() : Promise.reject())
		.then(data => {
			if (Array.isArray(data)) {
				document.getElementById('stat-total-lists').textContent = data.length;
			}
		})
		.catch(() => {
			document.getElementById('stat-total-lists').textContent = '—';
		});

	// Total Users
	fetch('/api/admin/users', { credentials: 'include' })
		.then(r => r.ok ? r.json() : Promise.reject())
		.then(data => {
			if (Array.isArray(data)) {
				document.getElementById('stat-total-users').textContent = data.length;
			}
		})
		.catch(() => {
			document.getElementById('stat-total-users').textContent = '—';
		});
}

// ==================== Task Tag Management ====================

let taskTagModalMode = 'add';
let editingTaskTagId = null;
let taskTagPreviousFocus = null;

function setTaskTypeStatus(message, isError = false) {
	const status = document.getElementById('task-type-status');
	if (!status) return;
	status.textContent = message;
	status.className = `task-tags-feedback ${isError ? 'is-error' : 'is-success'}`;
}

function setTaskTagModalStatus(message, isError = false) {
	const status = document.getElementById('task-tag-modal-status');
	if (!status) return;
	status.textContent = message;
	status.className = `task-tags-feedback mb-3 ${isError ? 'is-error' : 'is-success'}`;
}

function setTaskTagsTableMessage(message, isError = false) {
	const list = document.getElementById('task-types-list');
	if (!list) return;
	list.innerHTML = '';
	const row = document.createElement('tr');
	const cell = document.createElement('td');
	cell.colSpan = 4;
	cell.className = `task-tags-table-message${isError ? ' is-error' : ''}`;
	cell.textContent = message;
	row.appendChild(cell);
	list.appendChild(row);
}

async function loadTaskTypes() {
	if (!document.getElementById('task-types-list')) return;

	setTaskTagsTableMessage('Loading tags...');
	try {
		const response = await fetch('/api/admin/task-types', { credentials: 'include' });
		if (!response.ok) throw new Error('Failed to load tags');
		renderTaskTypes(await response.json());
	} catch (error) {
		console.error('Error loading tags:', error);
		setTaskTagsTableMessage('Failed to load tags', true);
	}
}

function closeTaskTagMenus(except = null) {
	document.querySelectorAll('.task-tag-menu-dropdown.show').forEach((menu) => {
		if (menu === except) return;
		menu.classList.remove('show');
		menu.setAttribute('aria-hidden', 'true');
		menu.parentElement?.querySelector('.task-tag-menu-button')?.setAttribute('aria-expanded', 'false');
	});
}

function createTaskTagMenuItem(label, onClick) {
	const item = document.createElement('button');
	item.type = 'button';
	item.className = 'task-tag-menu-item';
	item.setAttribute('role', 'menuitem');
	item.textContent = label;
	item.addEventListener('click', (event) => {
		event.stopPropagation();
		closeTaskTagMenus();
		onClick();
	});
	return item;
}

function renderTaskTypes(taskTypes) {
	const list = document.getElementById('task-types-list');
	if (!list) return;

	list.innerHTML = '';
	if (!Array.isArray(taskTypes) || taskTypes.length === 0) {
		setTaskTagsTableMessage('No tags configured.');
		return;
	}

	taskTypes.forEach((taskType) => {
		const row = document.createElement('tr');
		row.className = `task-tag-row${taskType.is_active ? '' : ' is-inactive'}`;
		row.dataset.taskTypeId = String(taskType.id);

		const nameCell = document.createElement('td');
		const name = document.createElement('span');
		name.className = 'task-tag-name';
		name.textContent = taskType.label;
		nameCell.appendChild(name);

		const countCell = document.createElement('td');
		countCell.className = 'task-tags-count-column task-tag-count';
		countCell.textContent = typeof taskType.task_count === 'number' ? String(taskType.task_count) : '—';

		const statusCell = document.createElement('td');
		const statusBadge = document.createElement('span');
		statusBadge.className = `task-tag-status-badge ${taskType.is_active ? 'is-active' : 'is-inactive'}`;
		statusBadge.textContent = taskType.is_active ? 'Active' : 'Inactive';
		statusCell.appendChild(statusBadge);

		const actionsCell = document.createElement('td');
		actionsCell.className = 'task-tag-actions-cell';
		const menu = document.createElement('div');
		menu.className = 'task-tag-menu';
		const menuButton = document.createElement('button');
		menuButton.type = 'button';
		menuButton.className = 'task-tag-menu-button';
		menuButton.setAttribute('aria-label', `More actions for ${taskType.label}`);
		menuButton.setAttribute('aria-haspopup', 'menu');
		menuButton.setAttribute('aria-expanded', 'false');
		menuButton.textContent = '⋯';

		const menuDropdown = document.createElement('div');
		menuDropdown.className = 'navbar-burger-dropdown task-tag-menu-dropdown';
		menuDropdown.setAttribute('role', 'menu');
		menuDropdown.setAttribute('aria-hidden', 'true');
		menuDropdown.appendChild(createTaskTagMenuItem('Edit tag', () => openTaskTagModal('edit', taskType)));
		menuDropdown.appendChild(createTaskTagMenuItem(
			taskType.is_active ? 'Deactivate tag' : 'Activate tag',
			() => updateTaskTagStatus(taskType),
		));

		menuButton.addEventListener('click', (event) => {
			event.stopPropagation();
			const isOpen = menuDropdown.classList.contains('show');
			closeTaskTagMenus(menuDropdown);
			menuDropdown.classList.toggle('show', !isOpen);
			menuDropdown.setAttribute('aria-hidden', String(isOpen));
			menuButton.setAttribute('aria-expanded', String(!isOpen));
		});

		menu.appendChild(menuButton);
		menu.appendChild(menuDropdown);
		actionsCell.appendChild(menu);

		row.appendChild(nameCell);
		row.appendChild(countCell);
		row.appendChild(statusCell);
		row.appendChild(actionsCell);
		list.appendChild(row);
	});
}

function openTaskTagModal(mode, taskType = null) {
	const modal = document.getElementById('task-tag-modal');
	const title = document.getElementById('task-tag-modal-title');
	const description = document.getElementById('task-tag-modal-description');
	const input = document.getElementById('task-tag-name');
	const saveButton = document.getElementById('task-tag-save');
	if (!modal || !title || !description || !input || !saveButton) return;

	taskTagModalMode = mode;
	editingTaskTagId = taskType?.id ?? null;
	taskTagPreviousFocus = document.activeElement;
	title.textContent = mode === 'edit' ? 'Edit tag' : 'Add tag';
	description.textContent = mode === 'edit'
		? 'Change the visible name for this tag.'
		: 'Add a tag teachers can assign to tasks.';
	saveButton.textContent = mode === 'edit' ? 'Save change' : 'Add tag';
	input.value = taskType?.label || '';
	setTaskTagModalStatus('');
	modal.hidden = false;
	input.focus();
	if (mode === 'edit') input.select();
}

function closeTaskTagModal() {
	const modal = document.getElementById('task-tag-modal');
	const input = document.getElementById('task-tag-name');
	if (!modal) return;

	modal.hidden = true;
	editingTaskTagId = null;
	if (input) input.value = '';
	setTaskTagModalStatus('');
	if (taskTagPreviousFocus instanceof HTMLElement) taskTagPreviousFocus.focus();
	taskTagPreviousFocus = null;
}

async function saveTaskTag() {
	const input = document.getElementById('task-tag-name');
	const saveButton = document.getElementById('task-tag-save');
	const label = input?.value.trim() || '';
	if (!input || !saveButton) return;
	if (!label) {
		setTaskTagModalStatus('Enter a tag name.', true);
		input.focus();
		return;
	}

	saveButton.disabled = true;
	try {
		const isEditing = taskTagModalMode === 'edit';
		const response = await fetch(
			isEditing ? `/api/admin/task-types/${editingTaskTagId}` : '/api/admin/task-types',
			{
				method: isEditing ? 'PATCH' : 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ label }),
			},
		);
		if (!response.ok) {
			const payload = await response.json().catch(() => ({}));
			throw new Error(payload.detail || `Failed to ${isEditing ? 'update' : 'add'} tag`);
		}

		closeTaskTagModal();
		setTaskTypeStatus(`${isEditing ? 'Updated' : 'Added'} “${label}”.`);
		await loadTaskTypes();
	} catch (error) {
		console.error('Error saving tag:', error);
		setTaskTagModalStatus(error.message, true);
	} finally {
		saveButton.disabled = false;
	}
}

async function updateTaskTagStatus(taskType) {
	try {
		const response = await fetch(`/api/admin/task-types/${taskType.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({ is_active: !taskType.is_active }),
		});
		if (!response.ok) {
			const payload = await response.json().catch(() => ({}));
			throw new Error(payload.detail || 'Failed to update tag status');
		}

		setTaskTypeStatus(`${taskType.is_active ? 'Deactivated' : 'Activated'} “${taskType.label}”.`);
		await loadTaskTypes();
	} catch (error) {
		console.error('Error updating tag status:', error);
		setTaskTypeStatus(error.message, true);
	}
}

function initTaskTypeManagement() {
	const addButton = document.getElementById('add-task-type-btn');
	const modal = document.getElementById('task-tag-modal');
	const cancelButton = document.getElementById('task-tag-cancel');
	const closeButton = document.getElementById('task-tag-modal-close');
	const saveButton = document.getElementById('task-tag-save');
	const input = document.getElementById('task-tag-name');
	if (!addButton || !modal || !cancelButton || !closeButton || !saveButton || !input) return;

	addButton.addEventListener('click', () => openTaskTagModal('add'));
	cancelButton.addEventListener('click', closeTaskTagModal);
	closeButton.addEventListener('click', closeTaskTagModal);
	saveButton.addEventListener('click', saveTaskTag);
	input.addEventListener('keydown', (event) => {
		if (event.key === 'Enter') saveTaskTag();
		if (event.key === 'Escape') closeTaskTagModal();
	});
	modal.addEventListener('click', (event) => {
		if (event.target === modal) closeTaskTagModal();
	});
	document.addEventListener('click', () => closeTaskTagMenus());
	document.addEventListener('keydown', (event) => {
		if (event.key === 'Escape') {
			if (!modal.hidden) closeTaskTagModal();
			closeTaskTagMenus();
		}
	});

	loadTaskTypes();
}

// ==================== Token Management ====================

function initTokenManagement() {
	const generateBtn = document.getElementById('generate-token-btn');
	const addTokenBtn = document.getElementById('add-token-btn');
	const copyBtn = document.getElementById('copy-token-btn');

	if (generateBtn) {
		generateBtn.addEventListener('click', generateToken);
	}
	if (addTokenBtn) {
		addTokenBtn.addEventListener('click', addToken);
	}
	if (copyBtn) {
		copyBtn.addEventListener('click', copyTokenToClipboard);
	}

	loadTokensList();
}

function generateToken() {
	const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let token = '';
	for (let i = 0; i < 15; i++) {
		token += characters.charAt(Math.floor(Math.random() * characters.length));
	}
	const tokenInput = document.getElementById('token-input');
	tokenInput.value = token;
	tokenInput.focus();
}

function addToken() {
	const tokenInput = document.getElementById('token-input');
	const token = tokenInput.value.trim();

	if (!token) {
		alert('Please enter or generate a token');
		return;
	}

	if (token.length < 10) {
		alert('Token must be at least 10 characters long');
		return;
	}

	const btn = document.getElementById('add-token-btn');
	const originalText = btn.innerHTML;
	btn.disabled = true;
	btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';

	fetch('/api/admin/registration-tokens', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		credentials: 'include',
		body: JSON.stringify({ token })
	})
	.then(r => {
		if (!r.ok) {
			if (r.status === 400) {
				return r.json().then(data => { throw new Error(data.detail || 'Invalid token'); });
			}
			throw new Error('Failed to add token');
		}
		return r.json();
	})
	.then(data => {
		const tokenDisplay = document.getElementById('token-display');
		const tokenValue = document.getElementById('token-value');
		const tokenExpires = document.getElementById('token-expires');
		if (tokenDisplay && tokenValue) {
			tokenValue.textContent = data.token || token;
			if (tokenExpires) tokenExpires.textContent = data.expires_at ? formatDate(data.expires_at) : '';
			tokenDisplay.style.display = 'block';
		}
		tokenInput.value = '';
		loadTokensList();
		btn.disabled = false;
		btn.innerHTML = originalText;
	})
	.catch(err => {
		console.error('Error adding token:', err);
		alert('Failed to add token: ' + err.message);
		btn.disabled = false;
		btn.innerHTML = originalText;
	});
}

function loadTokensList() {
	const listContainer = document.getElementById('tokens-list');
	if (!listContainer) return;

	listContainer.innerHTML = '<div class="text-muted small"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

	fetch('/api/admin/registration-tokens', { credentials: 'include' })
	.then(r => {
		if (!r.ok) throw new Error('Failed to load tokens');
		return r.json();
	})
	.then(tokens => {
		if (!Array.isArray(tokens) || tokens.length === 0) {
			listContainer.innerHTML = '<p class="text-muted small mb-0">No tokens created yet</p>';
			return;
		}
		let html = '';
		tokens.forEach(token => {
			const createdDate = formatDate(token.created_at);
			const expiresDate = token.expires_at ? formatDate(token.expires_at) : 'N/A';
			html += `
				<div class="token-item p-2 border-bottom d-flex justify-content-between align-items-center">
					<div style="flex: 1; min-width: 0;">
						<small class="text-dark"><strong>ID: ${token.id}</strong></small><br>
						<small class="text-muted">Created: ${createdDate}</small><br>
						<small class="text-muted"><i class="fas fa-clock"></i> Expires: ${expiresDate}</small>
					</div>
					<button class="btn btn-sm btn-outline-danger ml-2" onclick="deleteToken(${token.id})" aria-label="Delete token ${token.id}">
						<i class="fas fa-trash" aria-hidden="true"></i>
					</button>
				</div>
			`;
		});
		listContainer.innerHTML = html;
	})
	.catch(err => {
		console.error('Error loading tokens:', err);
		listContainer.innerHTML = '<p class="text-danger small mb-0">Failed to load tokens</p>';
	});
}

window.deleteToken = function(tokenId) {
	if (!confirm('Are you sure you want to delete this token? Teachers won\'t be able to register with it anymore.')) {
		return;
	}
	fetch(`/api/admin/registration-tokens/${tokenId}`, {
		method: 'DELETE',
		credentials: 'include'
	})
	.then(r => {
		if (!r.ok) throw new Error('Failed to delete token');
		loadTokensList();
	})
	.catch(err => {
		console.error('Error deleting token:', err);
		alert('Failed to delete token: ' + err.message);
	});
};

function copyTokenToClipboard() {
	const tokenValue = document.getElementById('token-value');
	if (!tokenValue) return;
	navigator.clipboard.writeText(tokenValue.textContent).then(() => {
		const btn = document.getElementById('copy-token-btn');
		const originalText = btn.innerHTML;
		btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
		setTimeout(() => { btn.innerHTML = originalText; }, 2000);
	}).catch(err => {
		console.error('Failed to copy:', err);
		alert('Failed to copy token');
	});
}

// ==================== Access Check ====================

fetch('/api/admin/registration-tokens', { credentials: 'include' })
	.then(r => {
		if (r.status === 403 || r.status === 401) {
			window.location.href = '/';
			return;
		}
		if (r.ok) {
			initTokenManagement();
			initTaskTypeManagement();
			loadStatistics();
		}
	})
	.catch(() => {
		window.location.href = '/';
	});

import {initProtectedPage, initSignedInAs, initBurgerMenu} from '../core/auth-ui.js';
import { escapeHtml, formatDate } from '../utils/ui-utils.js';

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

const teacherSearchInput = document.getElementById('teacher-search');
const studentSearchInput = document.getElementById('student-search');
const userCountBadge = document.getElementById('user-count-badge');
const teachersContainer = document.getElementById('teachers-container');
const studentsContainer = document.getElementById('students-container');

let allUsers = [];



function renderUsers() {
	renderGroup('teacher', teacherSearchInput.value.trim().toLowerCase(), teachersContainer);
	renderGroup('student', studentSearchInput.value.trim().toLowerCase(), studentsContainer);

	// Update total count
	userCountBadge.textContent = `${allUsers.length} user${allUsers.length !== 1 ? 's' : ''} total`;
	userCountBadge.className = 'badge badge-info p-2';
	userCountBadge.style.display = 'inline-block';
}

function renderGroup(role, query, container) {
	const filteredUsers = allUsers.filter(user => {
		// Filter by role
		if (user.role !== role) {
			return false;
		}
		// Filter by search query (username or email)
		if (query) {
			const usernameMatch = user.username && user.username.toLowerCase().includes(query);
			const emailMatch = user.email && user.email.toLowerCase().includes(query);
			return usernameMatch || emailMatch;
		}
		return true;
	});

	// Clear container
	container.classList.remove('loading-spinner', 'text-center');
	container.innerHTML = '';

	if (filteredUsers.length === 0) {
		const emptyMsg = document.createElement('p');
		emptyMsg.className = 'text-muted mt-4 text-center';
		emptyMsg.textContent = `No ${role}s match your criteria.`;
		container.appendChild(emptyMsg);
		return;
	}

	filteredUsers.forEach(user => {
		const card = document.createElement('div');
		card.className = 'task-set-item';
		if (user.role === 'teacher' || user.role === 'student') {
			card.style.cursor = 'pointer';
			card.title = `Click to view ${user.username}'s details`;
			card.addEventListener('click', (e) => {
				if (e.target.closest('button') || e.target.closest('.task-set-code-chip.copied')) {
					return;
				}
				if (user.role === 'teacher') {
					window.location.href = `/admin/admins-teacher-view?teacher_id=${user.id}`;
				} else {
					window.location.href = `/admin/admins-student-view?student_id=${user.id}`;
				}
			});
		}

		// Top row: Title and Status Chips
		const headerDiv = document.createElement('div');
		headerDiv.className = 'task-set-item-top';

		const titleWrap = document.createElement('div');
		titleWrap.style.display = 'flex';
		titleWrap.style.alignItems = 'center';
		titleWrap.style.gap = '.45rem';
		titleWrap.style.minWidth = '0';

		const icon = document.createElement('i');
		icon.className = user.role === 'teacher' ? 'fas fa-chalkboard-teacher text-primary' : 'fas fa-graduation-cap text-success';
		titleWrap.appendChild(icon);

		const titleDiv = document.createElement('div');
		titleDiv.className = 'task-set-title';
		titleDiv.textContent = user.username;
		titleWrap.appendChild(titleDiv);

		headerDiv.appendChild(titleWrap);

		const badgesDiv = document.createElement('div');
		badgesDiv.className = 'd-flex align-items-center';
		badgesDiv.style.gap = '0.35rem';

		if (user.is_admin_teacher) {
			const adminChip = document.createElement('div');
			adminChip.className = 'task-set-code-chip';
			adminChip.style.borderColor = '#fbbf24';
			adminChip.style.color = '#b45309';
			adminChip.style.backgroundColor = '#fffbeb';
			adminChip.innerHTML = '<i class="fas fa-shield-alt" style="color:#b45309"></i> Admin';
			badgesDiv.appendChild(adminChip);
		}

		const statusChip = document.createElement('div');
		statusChip.className = 'task-set-code-chip';
		if (user.is_active) {
			statusChip.innerHTML = '<i class="fas fa-check-circle" style="color:var(--green)"></i> Active';
		} else {
			statusChip.innerHTML = '<i class="fas fa-times-circle" style="color:var(--red)"></i> Inactive';
			statusChip.style.color = 'var(--red)';
		}
		badgesDiv.appendChild(statusChip);
		headerDiv.appendChild(badgesDiv);

		card.appendChild(headerDiv);

		// Meta info
		const metaDiv = document.createElement('div');
		metaDiv.className = 'task-set-meta';
		metaDiv.innerHTML = `
			<div style="margin-bottom: 0.2rem;"><i class="far fa-envelope"></i> Email: ${escapeHtml(user.email)}</div>
			<div style="margin-bottom: 0.2rem;"><i class="far fa-calendar-alt"></i> Registered: ${formatDate(user.created_at)}</div>
			<div><i class="fas fa-id-badge"></i> User ID: ${user.id}</div>
		`;
		card.appendChild(metaDiv);

		// Actions
		const actionsContainer = document.createElement('div');
		actionsContainer.className = 'd-flex flex-wrap mt-2';
		actionsContainer.style.gap = '0.5rem';

		if (!user.is_admin_teacher && user.role === 'teacher' && !user.is_current_user && user.id !== 999999) {
			const makeAdminBtn = document.createElement('button');
			makeAdminBtn.className = 'btn btn-sm btn-outline-success';
			makeAdminBtn.innerHTML = '<i class="fas fa-user-shield"></i> Make Admin';
			makeAdminBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				makeAdmin(user.id, user.username);
			});
			actionsContainer.appendChild(makeAdminBtn);
		}

		if (!user.is_admin_teacher && !user.is_current_user && user.id !== 999999) {
			const deleteBtn = document.createElement('button');
			deleteBtn.className = 'btn btn-sm btn-outline-danger';
			deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i> Delete';
			deleteBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				deleteUser(user.role, user.id, user.username);
			});
			actionsContainer.appendChild(deleteBtn);
		}

		if (user.id !== 999999 && (!user.is_admin_teacher || user.is_current_user)) {
			const resetPwdBtn = document.createElement('button');
			resetPwdBtn.className = 'btn btn-sm btn-outline-info';
			resetPwdBtn.innerHTML = '<i class="fas fa-key"></i> Reset Password';
			resetPwdBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				resetUserPassword(user.role, user.id, user.username);
			});
			actionsContainer.appendChild(resetPwdBtn);
		}

		if (actionsContainer.children.length > 0) {
			card.appendChild(actionsContainer);
		}

		container.appendChild(card);
	});
}

function loadUsers() {
	fetch('/api/admin/users', { credentials: 'include' })
		.then(r => {
			if (r.status === 403 || r.status === 401) {
				window.location.href = '/';
				return;
			}
			if (!r.ok) {
				throw new Error('Failed to load users');
			}
			return r.json();
		})
		.then(data => {
			if (data) {
				allUsers = data;
				renderUsers();
			}
		})
		.catch(err => {
			console.error('Error loading users:', err);
			teachersContainer.innerHTML = '<p class="text-danger mt-2">Failed to load teachers list. Please try again.</p>';
			studentsContainer.innerHTML = '<p class="text-danger mt-2">Failed to load students list. Please try again.</p>';
		});
}

// Event Listeners
teacherSearchInput.addEventListener('input', renderUsers);
studentSearchInput.addEventListener('input', renderUsers);

// Access Check and Initial Load
fetch('/api/admin/registration-tokens', { credentials: 'include' })
	.then(r => {
		if (r.status === 403 || r.status === 401) {
			window.location.href = '/';
			return;
		}
		if (r.ok) {
			loadUsers();
		}
	})
	.catch(() => {
		window.location.href = '/';
	});



function showPasswordPrompt(options = {}) {
	const {
		titleText = 'Confirm Action',
		warningText = '',
		warningColor = '#333',
		instructionText = 'To confirm, enter your admin password:'
	} = options;

	let confirmBtnClass = 'btn-primary';
	if (warningColor === '#dc3545' || warningColor === 'red') {
		confirmBtnClass = 'btn-danger';
	} else if (warningColor === '#28a745' || warningColor === 'green') {
		confirmBtnClass = 'btn-success';
	} else if (warningColor === '#0284c7' || warningColor === 'blue') {
		confirmBtnClass = 'btn-info';
	}

	return new Promise((resolve) => {
		const overlay = document.createElement('div');
		overlay.className = 'admin-modal-overlay';
		overlay.innerHTML = `
			<div class="admin-modal">
				<h5>${escapeHtml(titleText)}</h5>
				${warningText ? `<div class="admin-modal-warning" style="color: ${warningColor}">${escapeHtml(warningText)}</div>` : ''}
				<p>${escapeHtml(instructionText)}</p>
				<input type="password" class="form-control mb-3" placeholder="Enter password" autocomplete="off" />
				<div class="admin-modal-actions">
					<button type="button" class="btn btn-outline-secondary cancel-btn">Cancel</button>
					<button type="button" class="btn ${confirmBtnClass} confirm-btn">Confirm</button>
				</div>
			</div>
		`;

		const input = overlay.querySelector('input');
		const confirmBtn = overlay.querySelector('.confirm-btn');
		const cancelBtn = overlay.querySelector('.cancel-btn');

		document.body.appendChild(overlay);
		input.focus();

		function cleanUp() {
			document.body.removeChild(overlay);
		}

		confirmBtn.addEventListener('click', () => {
			const val = input.value;
			cleanUp();
			resolve(val);
		});

		cancelBtn.addEventListener('click', () => {
			cleanUp();
			resolve(null);
		});

		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				const val = input.value;
				cleanUp();
				resolve(val);
			} else if (e.key === 'Escape') {
				cleanUp();
				resolve(null);
			}
		});

		overlay.addEventListener('click', (e) => {
			if (e.target === overlay) {
				cleanUp();
				resolve(null);
			}
		});
	});
}

async function deleteUser(role, id, username) {
	const password = await showPasswordPrompt({
		titleText: 'Confirm Deletion',
		warningText: `Are you sure you want to delete the ${role} "${username}"?`,
		warningColor: '#dc3545', // Red
		instructionText: 'To confirm, enter your admin password:'
	});
	if (password === null) return;
	if (!password) {
		alert('Password cannot be empty.');
		return;
	}

	fetch(`/api/admin/users/${role}/${id}`, {
		method: 'DELETE',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ admin_password: password }),
		credentials: 'include',
	})
	.then(r => {
		if (!r.ok) return r.json().then(data => Promise.reject(data.detail || 'Delete failed'));
		return r.json();
	})
	.then(() => {
		allUsers = allUsers.filter(u => !(u.id === id && u.role === role));
		renderUsers();
	})
	.catch(err => {
		alert(typeof err === 'string' ? err : 'Failed to delete user.');
	});
}

async function makeAdmin(id, username) {
	const password = await showPasswordPrompt({
		titleText: 'Confirm Make Admin',
		warningText: `Are you sure you want to make "${username}" an admin?`,
		warningColor: '#28a745', // Green
		instructionText: 'To confirm, enter your admin password:'
	});
	if (password === null) return;
	if (!password) {
		alert('Password cannot be empty.');
		return;
	}

	fetch(`/api/admin/users/teacher/${id}/make-admin`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ admin_password: password }),
		credentials: 'include',
	})
	.then(r => {
		if (!r.ok) return r.json().then(data => Promise.reject(data.detail || 'Failed to make admin'));
		return r.json();
	})
	.then(() => {
		const user = allUsers.find(u => u.id === id && u.role === 'teacher');
		if (user) {
			user.is_admin_teacher = true;
		}
		renderUsers();
	})
	.catch(err => {
		alert(typeof err === 'string' ? err : 'Failed to make admin.');
	});
}

function showResetResultModal(username, role, newPassword) {
	const overlay = document.createElement('div');
	overlay.className = 'admin-modal-overlay';
	overlay.innerHTML = `
		<div class="admin-modal">
			<h5 class="text-success"><i class="fas fa-check-circle"></i> Password Reset Successful</h5>
			<p>Password for <strong>${escapeHtml(username)}</strong> (${escapeHtml(role)}) has been reset. Please copy this new temporary password and email it to the user:</p>
			<div class="admin-password-box">
				<input type="text" class="admin-password-input" readonly value="${escapeHtml(newPassword)}" />
				<button type="button" class="btn btn-outline-primary copy-btn"><i class="fas fa-copy"></i> Copy</button>
			</div>
			<div class="admin-modal-actions">
				<button type="button" class="btn btn-primary close-btn">Close</button>
			</div>
		</div>
	`;

	const passInput = overlay.querySelector('.admin-password-input');
	const copyBtn = overlay.querySelector('.copy-btn');
	const closeBtn = overlay.querySelector('.close-btn');

	copyBtn.addEventListener('click', async () => {
		try {
			await navigator.clipboard.writeText(newPassword);
		} catch {
			passInput.select();
			document.execCommand('copy');
		}
		copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
		copyBtn.className = 'btn btn-success copy-btn';
		setTimeout(() => {
			copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy';
			copyBtn.className = 'btn btn-outline-primary copy-btn';
		}, 2000);
	});

	closeBtn.addEventListener('click', () => {
		document.body.removeChild(overlay);
	});

	document.body.appendChild(overlay);
}

async function resetUserPassword(role, id, username) {
	const password = await showPasswordPrompt({
		titleText: 'Confirm Password Reset',
		warningText: `WARNING: Are you sure you want to reset the password for ${role} "${username}"? Their current password will be immediately invalidated and replaced with a temporary token.`,
		warningColor: '#0284c7',
		instructionText: 'To confirm, enter your admin password:'
	});
	if (password === null) return;
	if (!password) {
		alert('Password cannot be empty.');
		return;
	}

	fetch(`/api/admin/users/${role}/${id}/reset-password`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ admin_password: password }),
		credentials: 'include',
	})
	.then(r => {
		if (!r.ok) return r.json().then(data => Promise.reject(data.detail || 'Password reset failed'));
		return r.json();
	})
	.then(data => {
		if (data && data.new_password) {
			showResetResultModal(username, role, data.new_password);
		}
	})
	.catch(err => {
		alert(typeof err === 'string' ? err : 'Failed to reset password.');
	});
}



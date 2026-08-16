import {initProtectedPage, initSignedInAs, initBurgerMenu} from '../core/auth-ui.js';
import { escapeHtml, formatDate } from '../utils/ui-utils.js';
import { deleteUser, makeAdmin, resetUserPassword } from '../admin/admin-user-actions.js';

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
				makeAdmin(user.id, user.username, () => {
					user.is_admin_teacher = true;
					renderUsers();
				});
			});
			actionsContainer.appendChild(makeAdminBtn);
		}

		if (!user.is_admin_teacher && !user.is_current_user && user.id !== 999999) {
			const deleteBtn = document.createElement('button');
			deleteBtn.className = 'btn btn-sm btn-outline-danger';
			deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i> Delete';
			deleteBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				deleteUser(user.role, user.id, user.username, () => {
					allUsers = allUsers.filter(u => !(u.id === user.id && u.role === user.role));
					renderUsers();
				});
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




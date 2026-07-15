import {initProtectedPage, initSignedInAs} from '/js/auth-ui.js';

initProtectedPage('/');
initSignedInAs();

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

const userSearchInput = document.getElementById('user-search');
const roleRadioButtons = document.querySelectorAll('input[name="role-filter"]');
const userCountBadge = document.getElementById('user-count-badge');
const usersContainer = document.getElementById('users-container');

let allUsers = [];

function formatDate(isoString) {
	const date = new Date(isoString);
	return date.toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
}

function escapeHtml(text) {
	if (!text) return '';
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}

function renderUsers() {
	const query = userSearchInput.value.trim().toLowerCase();
	let selectedRole = 'all';
	roleRadioButtons.forEach(radio => {
		if (radio.checked) {
			selectedRole = radio.value;
		}
	});

	const filteredUsers = allUsers.filter(user => {
		// Filter by role
		if (selectedRole !== 'all' && user.role !== selectedRole) {
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

	// Render badge
	if (filteredUsers.length === 0) {
		userCountBadge.textContent = 'No users found';
		userCountBadge.className = 'badge badge-warning p-2';
	} else {
		userCountBadge.textContent = `${filteredUsers.length} user${filteredUsers.length !== 1 ? 's' : ''} shown`;
		userCountBadge.className = 'badge badge-info p-2';
	}
	userCountBadge.style.display = 'inline-block';

	// Clear container
	usersContainer.classList.remove('loading-spinner');
	usersContainer.innerHTML = '';

	if (filteredUsers.length === 0) {
		const emptyMsg = document.createElement('p');
		emptyMsg.className = 'text-muted mt-4';
		emptyMsg.textContent = 'No users match your criteria.';
		usersContainer.appendChild(emptyMsg);
		return;
	}

	filteredUsers.forEach(user => {
		const card = document.createElement('div');
		card.className = 'user-card';

		const headerDiv = document.createElement('div');
		headerDiv.className = 'd-flex justify-content-between align-items-center mb-2';

		const titleDiv = document.createElement('div');
		titleDiv.className = 'd-flex align-items-center';

		const icon = document.createElement('i');
		icon.className = user.role === 'teacher' ? 'fas fa-chalkboard-teacher text-primary mr-2' : 'fas fa-graduation-cap text-success mr-2';
		titleDiv.appendChild(icon);

		const usernameSpan = document.createElement('strong');
		usernameSpan.style.fontSize = '1.1rem';
		usernameSpan.textContent = user.username;
		titleDiv.appendChild(usernameSpan);

		const badgesDiv = document.createElement('div');
		badgesDiv.className = 'd-flex align-items-center';

		const roleBadge = document.createElement('span');
		roleBadge.className = `user-role-badge mr-2 badge-${user.role}`;
		roleBadge.textContent = user.role.toUpperCase();
		badgesDiv.appendChild(roleBadge);

		const statusBadge = document.createElement('span');
		statusBadge.className = `user-status-badge mr-2 ${user.is_active ? 'status-active' : 'status-inactive'}`;
		statusBadge.textContent = user.is_active ? 'Active' : 'Inactive';
		badgesDiv.appendChild(statusBadge);

		if (user.is_admin_teacher) {
			const adminBadge = document.createElement('span');
			adminBadge.className = 'user-role-badge';
			adminBadge.style.backgroundColor = '#fff3cd';
			adminBadge.style.color = '#856404';
			adminBadge.textContent = 'ADMIN';
			badgesDiv.appendChild(adminBadge);
		} else if (!user.is_current_user && user.id !== 999999) {
			const deleteBtn = document.createElement('button');
			deleteBtn.className = 'btn btn-sm btn-outline-danger';
			deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
			deleteBtn.title = `Delete ${user.username}`;
			deleteBtn.addEventListener('click', () => deleteUser(user.role, user.id, user.username));
			badgesDiv.appendChild(deleteBtn);
		}

		headerDiv.appendChild(titleDiv);
		headerDiv.appendChild(badgesDiv);

		const bodyDiv = document.createElement('div');
		bodyDiv.className = 'user-meta-info';
		bodyDiv.innerHTML = `
			<div><i class="far fa-envelope"></i> Email: ${escapeHtml(user.email)}</div>
			<div><i class="far fa-calendar-alt"></i> Registered: ${formatDate(user.created_at)}</div>
			<div><i class="fas fa-id-badge"></i> User ID: ${user.id}</div>
		`;

		card.appendChild(headerDiv);
		card.appendChild(bodyDiv);

		if (!user.is_admin_teacher && user.role === 'teacher' && !user.is_current_user && user.id !== 999999) {
			const cardActions = document.createElement('div');
			cardActions.className = 'd-flex justify-content-end mt-2';
			const makeAdminBtn = document.createElement('button');
			makeAdminBtn.className = 'btn btn-sm btn-outline-success';
			makeAdminBtn.innerHTML = '<i class="fas fa-user-shield"></i> Make Admin';
			makeAdminBtn.title = `Make ${user.username} Admin`;
			makeAdminBtn.addEventListener('click', () => makeAdmin(user.id, user.username));
			cardActions.appendChild(makeAdminBtn);
			card.appendChild(cardActions);
		}

		usersContainer.appendChild(card);
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
			usersContainer.innerHTML = '<p class="text-danger">Failed to load users list. Please try again.</p>';
		});
}

// Event Listeners
userSearchInput.addEventListener('input', renderUsers);
roleRadioButtons.forEach(radio => {
	radio.addEventListener('change', renderUsers);
});

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

	return new Promise((resolve) => {
		const overlay = document.createElement('div');
		overlay.style.position = 'fixed';
		overlay.style.top = '0';
		overlay.style.left = '0';
		overlay.style.width = '100vw';
		overlay.style.height = '100vh';
		overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
		overlay.style.display = 'flex';
		overlay.style.alignItems = 'center';
		overlay.style.justifyContent = 'center';
		overlay.style.zIndex = '9999';

		const modal = document.createElement('div');
		modal.style.backgroundColor = '#fff';
		modal.style.padding = '20px';
		modal.style.borderRadius = '8px';
		modal.style.width = '400px';
		modal.style.maxWidth = '90%';
		modal.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.2)';
		modal.style.fontFamily = 'system-ui, -apple-system, sans-serif';

		const title = document.createElement('h5');
		title.style.margin = '0 0 15px 0';
		title.style.fontSize = '1.25rem';
		title.style.fontWeight = '600';
		title.textContent = titleText;
		modal.appendChild(title);

		if (warningText) {
			const warningEl = document.createElement('div');
			warningEl.style.margin = '0 0 12px 0';
			warningEl.style.fontSize = '1.05rem';
			warningEl.style.fontWeight = '600';
			warningEl.style.color = warningColor;
			warningEl.textContent = warningText;
			modal.appendChild(warningEl);
		}

		const text = document.createElement('p');
		text.style.margin = '0 0 15px 0';
		text.style.fontSize = '0.9rem';
		text.style.color = '#5f6b7a';
		text.textContent = instructionText;
		modal.appendChild(text);

		const input = document.createElement('input');
		input.type = 'password';
		input.placeholder = 'Enter password';
		input.style.width = '100%';
		input.style.padding = '8px 12px';
		input.style.marginBottom = '20px';
		input.style.border = '1px solid #ccc';
		input.style.borderRadius = '4px';
		input.style.fontSize = '1rem';
		modal.appendChild(input);

		const btnContainer = document.createElement('div');
		btnContainer.style.display = 'flex';
		btnContainer.style.justifyContent = 'flex-end';
		btnContainer.style.gap = '10px';

		const cancelBtn = document.createElement('button');
		cancelBtn.className = 'btn btn-outline-secondary';
		cancelBtn.textContent = 'Cancel';
		cancelBtn.type = 'button';
		btnContainer.appendChild(cancelBtn);

		const confirmBtn = document.createElement('button');
		if (warningColor === '#28a745' || warningColor === 'green') {
			confirmBtn.className = 'btn btn-success';
		} else {
			confirmBtn.className = 'btn btn-danger';
		}
		confirmBtn.textContent = 'Confirm';
		confirmBtn.type = 'button';
		btnContainer.appendChild(confirmBtn);

		modal.appendChild(btnContainer);
		overlay.appendChild(modal);
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
			'X-Admin-Password': password
		},
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
			'X-Admin-Password': password
		},
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


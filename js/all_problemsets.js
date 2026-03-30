import {initProtectedPage, initSignedInAs} from '/js/auth-ui.js';

initProtectedPage('/index.html');
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
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}

// ==================== Token Management ====================

function checkAdminAccess() {
	// Try to access admin endpoint to check if user is admin
	fetch('/api/admin/registration-tokens', { credentials: 'include' })
		.then(r => {
			if (r.status === 403) {
				// User is authenticated but not admin - hide admin section
				return false;
			}
			if (r.ok) {
				// User has access to admin endpoints
				return true;
			}
			return false;
		})
		.then(isAdmin => {
			if (isAdmin) {
				showAdminTokenSection();
			}
		})
		.catch(() => {
			// Error checking - don't show admin section
		});
}

function showAdminTokenSection() {
	const section = document.getElementById('admin-token-section');
	if (section) {
		section.style.display = 'block';
		initTokenManagement();
	}
}

function initTokenManagement() {
	const generateBtn = document.getElementById('generate-token-btn');
	const addTokenBtn = document.getElementById('add-token-btn');
	const copyBtn = document.getElementById('copy-token-btn');
	const tokenInput = document.getElementById('token-input');
	
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
	// Generate a 15-character random token
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

	const btn = document.getElementById('add-token-btn');
	const originalText = btn.innerHTML;
	btn.disabled = true;
	btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';

	fetch('/api/admin/registration-tokens', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		credentials: 'include',
		body: JSON.stringify({ token: token })
	})
	.then(r => {
		if (!r.ok) {
			if (r.status === 400) {
				return r.json().then(data => {
					throw new Error(data.detail || 'Invalid token');
				});
			}
			throw new Error('Failed to add token');
		}
		return r.json();
	})
	.then(data => {
		// Display the new token
		const tokenDisplay = document.getElementById('token-display');
		const tokenValue = document.getElementById('token-value');
		
		if (tokenDisplay && tokenValue) {
			tokenValue.textContent = data.token || token;
			tokenDisplay.style.display = 'block';
		}

		// Clear input
		tokenInput.value = '';

		// Reload the tokens list
		loadTokensList();

		// Reset button
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
	            html += `
	                <div class="token-item p-2 border-bottom d-flex justify-content-between align-items-center">
	                    <div style="flex: 1; min-width: 0;">
	                        <small class="text-dark"><strong>ID: ${token.id}</strong></small><br>
	                        <small class="text-muted">${createdDate}</small>
	                    </div>
	                    <button class="btn btn-sm btn-outline-danger ml-2" onclick="deleteToken(${token.id})">
	                        <i class="fas fa-trash"></i>
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

	const text = tokenValue.textContent;
	navigator.clipboard.writeText(text).then(() => {
		const btn = document.getElementById('copy-token-btn');
		const originalText = btn.innerHTML;
		btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
		setTimeout(() => {
			btn.innerHTML = originalText;
		}, 2000);
	}).catch(err => {
		console.error('Failed to copy:', err);
		alert('Failed to copy token');
	});
}

// ==================== Task Lists ====================

function createTaskListItem(taskList) {
	const item = document.createElement('div');
	item.className = 'task-list-item';
	item.onclick = () => {
	window.location.href = `/task_list_statistics?list_id=${taskList.id}`;
	};

	const title = document.createElement('div');
	title.className = 'task-list-title';
	title.textContent = taskList.title;

	const code = document.createElement('div');
	code.className = 'mb-2';
	const codeSpan = document.createElement('span');
	codeSpan.className = 'task-list-code';
	codeSpan.textContent = taskList.unique_link_code;
	code.appendChild(codeSpan);

	const meta = document.createElement('div');
	meta.className = 'task-list-meta';
	meta.innerHTML = `
	<i class="far fa-user"></i> Teacher ID: ${taskList.teacher_id}<br>
	<i class="far fa-calendar"></i> Created ${formatDate(taskList.created_at)}
	${taskList.expires_at ? `<br><i class="far fa-clock"></i> Expires ${formatDate(taskList.expires_at)}` : ''}
	`;

	item.appendChild(title);
	item.appendChild(code);
	item.appendChild(meta);

	return item;
}

function renderTaskLists(taskLists) {
	const container = document.getElementById('task-lists-container');
	container.className = '';
	container.innerHTML = '';

	if (taskLists.length === 0) {
	container.innerHTML = `
		<div class="empty-state">
		<i class="fas fa-folder-open"></i>
		<h4>No Task Lists Found</h4>
		<p>There are no task lists in the system yet.</p>
		</div>
	`;
	} else {
	const listsColumn = document.createElement('div');
	listsColumn.className = 'task-lists-column';

	taskLists.forEach(taskList => {
		listsColumn.appendChild(createTaskListItem(taskList));
	});
	
	container.appendChild(listsColumn);
	}
}

function showError(message) {
	const container = document.getElementById('task-lists-container');
	container.className = 'empty-state';
	container.innerHTML = `
	<i class="fas fa-exclamation-triangle text-danger"></i>
	<h4>Error Loading Task Lists</h4>
	<p>${escapeHtml(message || 'An unexpected error occurred.')}</p>
	`;
}

// ==================== Page Initialization ====================

// Check if user is admin and show token management section
checkAdminAccess();

// Load task lists
fetch('/api/all-problemsets', { credentials: 'include' })
	.then(r => {
	if (!r.ok) {
		if (r.status === 401 || r.status === 403) {
		window.location.href = '/index.html';
		return;
		}
		throw new Error('Failed to load task lists');
	}
	return r.json();
	})
	.then(data => {
	if (data) {
		renderTaskLists(data);
	}
	})
	.catch(err => {
	console.error('Error loading task lists:', err);
	showError(err.message);
	});
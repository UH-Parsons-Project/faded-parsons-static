import { escapeHtml } from '../utils/ui-utils.js';

export function showPasswordPrompt(options = {}) {
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

export function showResetResultModal(username, role, newPassword) {
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

export async function deleteUser(role, id, username, onSuccess) {
	const password = await showPasswordPrompt({
		titleText: 'Confirm Deletion',
		warningText: `Are you sure you want to delete the ${role} "${username}"?`,
		warningColor: '#dc3545',
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
	.then(data => {
		if (onSuccess) onSuccess(data);
	})
	.catch(err => {
		alert(typeof err === 'string' ? err : 'Failed to delete user.');
	});
}

export async function makeAdmin(id, username, onSuccess) {
	const password = await showPasswordPrompt({
		titleText: 'Confirm Make Admin',
		warningText: `Are you sure you want to make "${username}" an admin?`,
		warningColor: '#28a745',
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
	.then(data => {
		if (onSuccess) onSuccess(data);
	})
	.catch(err => {
		alert(typeof err === 'string' ? err : 'Failed to make admin.');
	});
}

export async function resetUserPassword(role, id, username, onSuccess) {
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
		if (onSuccess) onSuccess(data);
	})
	.catch(err => {
		alert(typeof err === 'string' ? err : 'Failed to reset password.');
	});
}

export function setupCopyButton(btnId, getTextFn) {
	const btn = document.getElementById(btnId);
	if (!btn) return;
	btn.addEventListener('click', (e) => {
		e.stopPropagation();
		const text = typeof getTextFn === 'function' ? getTextFn() : getTextFn;
		if (!text) return;
		navigator.clipboard.writeText(text).then(() => {
			btn.innerHTML = '<i class="fas fa-check" style="color: #15803d;"></i>';
			btn.title = 'Copied!';
			setTimeout(() => {
				btn.innerHTML = '<i class="far fa-copy"></i>';
				btn.title = 'Copy';
			}, 1800);
		}).catch(() => {
			alert('Failed to copy text.');
		});
	});
}


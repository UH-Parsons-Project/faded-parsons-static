import {initStudentLogout} from '/js/auth-ui.js';

// Init student logout
initStudentLogout();

// DOM elements
const userNameEl = document.getElementById('user-name');
const profileUsernameEl = document.getElementById('profile-username');
const profileCreatedEl = document.getElementById('profile-created');
const profileEmailEl = document.getElementById('profile-email');
const enrolledSetsContainer = document.getElementById('enrolled-sets-container');
const backToSetsBtn = document.getElementById('back-to-sets');

const changeEmailForm = document.getElementById('change-email-form');
const emailAlertPlaceholder = document.getElementById('email-alert-placeholder');

const changePasswordForm = document.getElementById('change-password-form');
const passwordAlertPlaceholder = document.getElementById(
	'password-alert-placeholder'
);

// Helpers for alerts
function showEmailAlert(message, type = 'danger') {
	emailAlertPlaceholder.innerHTML = `
    <div class="alert alert-${type} alert-dismissible fade show" role="alert" style="border-radius: 8px;">
      ${message}
      <button type="button" class="close" data-dismiss="alert" aria-label="Close">
        <span aria-hidden="true">&times;</span>
      </button>
    </div>
  `;
}

function showPasswordAlert(message, type = 'danger') {
	passwordAlertPlaceholder.innerHTML = `
    <div class="alert alert-${type} alert-dismissible fade show" role="alert" style="border-radius: 8px;">
      ${message}
      <button type="button" class="close" data-dismiss="alert" aria-label="Close">
        <span aria-hidden="true">&times;</span>
      </button>
    </div>
  `;
}

function formatDate(isoString) {
	if (!isoString) return '—';
	try {
		const date = new Date(isoString);
		return date.toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
		});
	} catch {
		return '—';
	}
}

function renderJoinedTaskSets(taskSets) {
	if (!enrolledSetsContainer) return;

	if (!taskSets || taskSets.length === 0) {
		enrolledSetsContainer.innerHTML = `
			<div class="text-muted">You have not joined any task sets yet.</div>
		`;
		return;
	}

	const activeSets = taskSets.filter((taskSet) => !taskSet.is_completed);
	const completedSets = taskSets.filter((taskSet) => taskSet.is_completed);

	const renderSetItem = (taskSet) => `
		<li class="list-group-item d-flex justify-content-between align-items-center">
			<div>
				<div class="font-weight-bold text-dark">${taskSet.title}</div>
				<div class="text-muted small">Teacher: ${taskSet.teacher_username || '—'}</div>
				<div class="text-muted small">${taskSet.completed_tasks || 0}/${taskSet.task_count || 0} completed</div>
			</div>
			<div class="d-flex flex-column align-items-end">
				<span class="badge ${taskSet.is_completed ? 'badge-success' : 'badge-light border'}">${taskSet.is_completed ? 'Completed' : 'In progress'}</span>
				<span class="badge badge-light border mt-2">${taskSet.unique_link_code}</span>
			</div>
		</li>
	`;

	const renderGroup = (title, sets) => `
		<div class="mb-3">
			<div class="text-uppercase text-muted small font-weight-bold mb-2">${title}</div>
			<ul class="list-group list-group-flush">
				${sets.map(renderSetItem).join('')}
			</ul>
		</div>
	`;

	const sections = [];
	if (activeSets.length > 0) {
		sections.push(renderGroup('Recent joined sets', activeSets));
	}
	if (completedSets.length > 0) {
		sections.push(renderGroup('Completed sets', completedSets));
	}

	enrolledSetsContainer.innerHTML = `
		${sections.join('')}
	`;
}

// Load student profile data
async function loadProfile() {
	try {
		const res = await fetch('/api/student/profile', {credentials: 'include'});
		if (!res.ok) {
			if (res.status === 401) {
				showUnauthorizedState();
			} else {
				if (enrolledSetsContainer) {
					enrolledSetsContainer.innerHTML =
						'<div class="text-danger">Failed to load profile data.</div>';
				}
			}
			return;
		}

		const data = await res.json();

		// Set user info displays
		if (userNameEl) userNameEl.textContent = data.username;
		if (profileUsernameEl) profileUsernameEl.textContent = data.username;
		if (profileEmailEl) profileEmailEl.textContent = data.email;
		if (profileCreatedEl)
			profileCreatedEl.textContent = formatDate(data.student_created_at);
		renderJoinedTaskSets(data.joined_task_sets);

		// Save student name fallback in local storage
		localStorage.setItem('nickname', data.username);

		// Setup back button and navbar link
		const lastSetUrl = localStorage.getItem('last_task_set_url') || '/';
		if (backToSetsBtn) {
			backToSetsBtn.href = lastSetUrl;
		}
		const profileLink = document.getElementById('profile-link');
		if (profileLink) {
			profileLink.href = lastSetUrl;
			profileLink.title = 'Back to Tasks';
		}
		const userRoleEl = document.getElementById('user-role');
		if (userRoleEl) {
			userRoleEl.textContent = 'Student';
			userRoleEl.style.display = 'inline-block';
			userRoleEl.className = 'badge badge-success';
		}
	} catch (error) {
		console.error('Error loading student profile:', error);
		if (enrolledSetsContainer) {
			enrolledSetsContainer.innerHTML =
				'<div class="text-danger">Network error loading profile.</div>';
		}
	}
}

function showUnauthorizedState() {
	document.body.innerHTML = `
    <div class="container py-5 text-center">
      <div class="card-soft p-5 mx-auto" style="max-width: 500px; border-radius: 16px;">
        <i class="fas fa-exclamation-triangle text-warning mb-3" style="font-size: 3rem;"></i>
        <h2 class="mb-3">Access Denied</h2>
        <p class="text-muted">You must log in to view this page. Please use the task set link provided by your teacher to access your tasks and log in.</p>
        <hr class="my-4">
        <a href="/" class="btn btn-primary" style="background-color: #0284c7; border-color: #0284c7; border-radius: 8px;">
          Go to Homepage
        </a>
      </div>
    </div>
  `;
}
// Form Handlers
changeEmailForm.addEventListener('submit', async (e) => {
	e.preventDefault();
	emailAlertPlaceholder.innerHTML = '';

	const email = document.getElementById('new-email').value;
	const password = document.getElementById('email-confirm-password').value;

	try {
		const res = await fetch('/api/student/profile/email', {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify({email, password}),
			credentials: 'include',
		});

		const data = await res.json();
		if (!res.ok) {
			showEmailAlert(data.detail || 'Failed to update email address.');
			return;
		}

		showEmailAlert('Email address successfully updated.', 'success');
		changeEmailForm.reset();
		if (profileEmailEl) profileEmailEl.textContent = email;
	} catch (err) {
		showEmailAlert('Network error updating email.');
	}
});

changePasswordForm.addEventListener('submit', async (e) => {
	e.preventDefault();
	passwordAlertPlaceholder.innerHTML = '';

	const current_password = document.getElementById('current-password').value;
	const new_password = document.getElementById('new-password').value;
	const new_password_confirm = document.getElementById(
		'new-password-confirm'
	).value;

	if (new_password !== new_password_confirm) {
		showPasswordAlert('New passwords do not match.');
		return;
	}

	if (new_password.length < 8) {
		showPasswordAlert('New password must be at least 8 characters long.');
		return;
	}

	try {
		const res = await fetch('/api/student/profile/password', {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify({
				current_password,
				new_password,
				new_password_confirm,
			}),
			credentials: 'include',
		});

		const data = await res.json();
		if (!res.ok) {
			showPasswordAlert(data.detail || 'Failed to update password.');
			return;
		}

		showPasswordAlert('Password successfully updated.', 'success');
		changePasswordForm.reset();
	} catch (err) {
		showPasswordAlert('Network error updating password.');
	}
});

// Run
loadProfile();

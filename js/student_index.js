import { initLoginPage } from '/js/auth-ui.js';
initLoginPage();

// Pass the task_set code to the register page so it can redirect back
const pathParts = window.location.pathname.split('/');
const code = pathParts[2];
document.getElementById('register-btn').addEventListener('click', () => {
	window.location.href = code ? `/student-register?code=${code}` : '/student-register';
});

// If the student already has a session cookie, show the Join button instead of the login form
if (code) {
	fetch('/api/student/me', { credentials: 'include' })
		.then(r => {
			if (!r.ok) return null;
			return r.json();
		})
		.then(data => {
			if (!data) return;

			// Student is already logged in — hide login form, show join button
			const loginForm = document.getElementById('login-form');
			const userInfo = document.getElementById('user-info');
			const joinBtn = document.getElementById('join-btn');
			const userNameEl = document.getElementById('user-name');

			if (loginForm) loginForm.style.display = 'none';
			if (userNameEl) userNameEl.textContent = data.username;
			if (userInfo) userInfo.style.display = 'flex';
			if (joinBtn) {
				joinBtn.style.display = 'inline-block';
				joinBtn.addEventListener('click', async () => {
					joinBtn.disabled = true;
					joinBtn.textContent = 'Joining...';
					try {
						const resp = await fetch(`/api/sets/${code}/join`, {
							method: 'POST',
							credentials: 'include',
						});
						if (resp.ok) {
							window.location.href = `/set/${code}/tasks`;
						} else {
							const err = await resp.json().catch(() => null);
							alert(err?.detail || 'Failed to join task set.');
							joinBtn.disabled = false;
							joinBtn.textContent = 'Join Task Set';
						}
					} catch {
						alert('Network error. Please try again.');
						joinBtn.disabled = false;
						joinBtn.textContent = 'Join Task Set';
					}
				});
			}
		})
		.catch(() => {
			// Not logged in or network error — leave login form visible
		});
}

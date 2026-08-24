import { showAlert } from '../utils/ui-utils.js';
const _params = new URLSearchParams(window.location.search);
const _code = _params.get('code');
const _username = _params.get('username');
if (_code && _username) {
	document.getElementById('login-link-container').innerHTML =
		'Already have an account? <a href="/' + _username + '/set/' + _code + '">Login</a>';
}

const form = document.getElementById('register-form');
const alertPlaceholder = document.getElementById('alert-placeholder');



form.addEventListener('submit', async (e) => {
	e.preventDefault();
	alertPlaceholder.innerHTML = '';

	const payload = {
		username: form.querySelector('#username').value,
		email: form.querySelector('#email').value,
		password: form.querySelector('#password').value,
		password_confirm: form.querySelector('#password_confirm').value,
	};

	// Client-side confirmation check
	if (payload.password !== payload.password_confirm) {
		showAlert(alertPlaceholder, 'Passwords do not match');
		return;
	}

	if (payload.password.length < 8) {
		showAlert(alertPlaceholder, 'Password must be at least 8 characters long.');
		return;
	}

	try {
		const res = await fetch('/api/student_register', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
		});

		const data = await res.json();
		if (!res.ok) {
			showAlert(alertPlaceholder, data.detail || data.message || 'Registration failed');
			return;
		}

		showAlert(alertPlaceholder, 'Registration successful.', 'success');
		form.reset();
		const params = new URLSearchParams(window.location.search);
		const code = params.get('code');
		const username = params.get('username');
		if (code && username) {
			setTimeout(() => { window.location.href = '/' + username + '/set/' + code; }, 1000);
		}
	} catch (err) {
		showAlert(alertPlaceholder, 'Network error');
	}
});

const _params = new URLSearchParams(window.location.search);
const _code = _params.get('code');
const _username = _params.get('username');
if (_code && _username) {
	document.getElementById('login-link-container').innerHTML =
		'Already have an account? <a href="/' + _username + '/set/' + _code + '">Login</a>';
}

const form = document.getElementById('register-form');
const alertPlaceholder = document.getElementById('alert-placeholder');

function showAlert(message, type = 'danger') {
	alertPlaceholder.innerHTML = `
		<div class="alert alert-${type}" role="alert">
			${message}
		</div>
	`;
}

form.addEventListener('submit', async (e) => {
	e.preventDefault();
	alertPlaceholder.innerHTML = '';

	const payload = {
		username: document.getElementById('username').value,
		email: document.getElementById('email').value,
		password: document.getElementById('password').value,
		password_confirm: document.getElementById('password_confirm').value,
	};

	// Client-side confirmation check
	if (payload.password !== payload.password_confirm) {
		showAlert('Passwords do not match');
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
			showAlert(data.detail || data.message || 'Registration failed');
			return;
		}

		showAlert('Registration successful.', 'success');
		form.reset();
		const params = new URLSearchParams(window.location.search);
		const code = params.get('code');
		const username = params.get('username');
		if (code && username) {
			setTimeout(() => { window.location.href = '/' + username + '/set/' + code; }, 1000);
		}
	} catch (err) {
		showAlert('Network error');
	}
});

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
        registration_token: document.getElementById('registration_token').value,
    };

    // Client-side confirmation check
    if (payload.password !== payload.password_confirm) {
        showAlert('Passwords do not match');
        return;
    }

    try {
        const res = await fetch('/api/register', {
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
    } catch (err) {
        showAlert('Network error');
    }
});

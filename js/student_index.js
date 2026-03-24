import { initLoginPage } from '/js/auth-ui.js';
initLoginPage();

// Pass the problemset code to the register page so it can redirect back
const pathParts = window.location.pathname.split('/');
const code = pathParts[2];
document.getElementById('register-btn').addEventListener('click', () => {
	window.location.href = code ? `/student_register?code=${code}` : '/student_register';
});

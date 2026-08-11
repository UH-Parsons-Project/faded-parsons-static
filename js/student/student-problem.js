import { initNavbarExercisesButton, initSignedInAs , initBurgerMenu } from "/js/core/auth-ui.js";
initBurgerMenu();
import { initWidget } from "/dist/bundle.js";
import { initStudentLogout } from '../core/auth-ui.js';
import { initInactivityTimer } from '../core/inactivity-timer.js';

const isPreview = window.location.pathname === '/task';

if (isPreview) {
	document.getElementById('user-name').textContent = 'PREVIEW';
	const profileLink = document.getElementById('profile-link');
	if (profileLink) profileLink.style.display = 'none';
	const logoutBtn = document.getElementById('logout-btn');
	if (logoutBtn) logoutBtn.style.display = 'none';
} else {
	initSignedInAs({ preferNickname: true });
	initStudentLogout();
}

initNavbarExercisesButton();

// Initialize problem widget separately from auth UI.
initWidget();

const backButton = document.getElementById('back-to-list');

if (isPreview) {
	if (backButton) {
		backButton.textContent = 'Close Preview';
		backButton.href = '#';
		backButton.addEventListener('click', (e) => {
			e.preventDefault();
			window.close();
		});
	}
} else {
	// Set the back button to return to the task set
	// Path: /{username}/set/{unique_link_code}/tasks/{task_id}
	const pathParts = window.location.pathname.split('/').filter(p => p);
	const username = pathParts[0];
	const uniqueLinkCode = pathParts[2];
	const taskId = pathParts[4];
	const dashboardUrl = `/${username}/set/${uniqueLinkCode}/tasks`;

	if (backButton && uniqueLinkCode) {
		backButton.href = dashboardUrl;
	}

	if (taskId) {
		initInactivityTimer(taskId, uniqueLinkCode, dashboardUrl).catch(console.error);
	}
}

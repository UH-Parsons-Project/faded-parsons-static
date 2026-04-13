import { initNavbarExercisesButton, initSignedInAs } from "/js/auth-ui.js";
import { initWidget } from "/dist/bundle.js";
import { initStudentLogout } from '/js/auth-ui.js';
import { initInactivityTimer } from '/js/inactivity-timer.js';

initSignedInAs({ preferNickname: true });
initNavbarExercisesButton();
initStudentLogout();

// Initialize problem widget separately from auth UI.
initWidget();

// Set the back button to return to the task set
// Path: /set/{unique_link_code}/tasks/{task_id}
const pathParts = window.location.pathname.split('/').filter(p => p);
const uniqueLinkCode = pathParts[1];
const taskId = pathParts[3];
const dashboardUrl = `/set/${uniqueLinkCode}/tasks`;

const backButton = document.getElementById('back-to-list');
if (backButton && uniqueLinkCode) {
	backButton.href = dashboardUrl;
}

if (taskId) {
	initInactivityTimer(taskId, dashboardUrl).catch(console.error);
}

import { initNavbarExercisesButton, initSignedInAs } from "/js/auth-ui.js";
import { initWidget } from "/dist/bundle.js";
import { initStudentLogout } from '/js/auth-ui.js';

initSignedInAs({ preferNickname: true });
initNavbarExercisesButton();
initStudentLogout();

// Initialize problem widget separately from auth UI.
initWidget();

// Set the back button to return to the task list
// Path: /set/{unique_link_code}/tasks/{task_id}
const pathParts = window.location.pathname.split('/').filter(p => p);
const uniqueLinkCode = pathParts[1];
const backButton = document.getElementById('back-to-list');
if (backButton && uniqueLinkCode) {
	backButton.href = `/set/${uniqueLinkCode}/tasks`;
}

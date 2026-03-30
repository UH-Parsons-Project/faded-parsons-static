import { initSignedInAs } from '/js/auth-ui.js';
import { initStudentLogout } from '/js/auth-ui.js';
initSignedInAs({ preferNickname: true });
initStudentLogout();

// Extract unique_link_code and task_id from URL path
// Path: /set/{unique_link_code}/tasks/{task_id}/start
const pathParts = window.location.pathname.split('/').filter(p => p);
const uniqueLinkCode = pathParts[1]; // set/starter-list/tasks/1/start -> starter-list
const taskId = pathParts[3]; // set/starter-list/tasks/1/start -> 1
const instructionsEl = document.getElementById('task-instructions');

// Check if already attempted in database and redirect if so
async function checkAndRedirectIfAttempted() {
	try {
		const response = await fetch(`/api/tasks/${taskId}/has-attempt`, {
			credentials: 'include'
		});
		if (response.ok) {
			const data = await response.json();
			if (data.has_attempted) {
				// Already attempted this task, redirect to the task page
				window.location.href = `/set/${uniqueLinkCode}/tasks/${taskId}`;
				return;
			}
		}
	} catch (error) {
		console.error('Error checking task attempt status:', error);
		// Continue with showing the start page if there's an error
	}
	
	// If we reach here, show the page content
	showPageContent();
}

// Show page content
function showPageContent() {
	const contentElements = [
		document.getElementById('start-btn'),
		document.getElementById('task-instructions'),
		document.getElementById('back-to-list')
	];
	contentElements.forEach(el => {
		if (el) el.style.display = '';
	});
}

// Check on page load
checkAndRedirectIfAttempted();

// Set the back button to return to the task list
const backButton = document.getElementById('back-to-list');
if (backButton) {
	backButton.href = `/set/${uniqueLinkCode}/tasks`;
}

// Set the start button to navigate to the task exercise
const startBtn = document.getElementById('start-btn');
if (startBtn) {
	startBtn.onclick = function() {
		// Store the task start time in localStorage when user clicks Start
		const startTime = new Date().toISOString();
		localStorage.setItem(`task_${taskId}_start_time`, startTime);
		
		// Replace current history entry so back button doesn't return here
		window.history.replaceState(null, '', `/set/${uniqueLinkCode}/tasks/${taskId}`);
		window.location.href = `/set/${uniqueLinkCode}/tasks/${taskId}`;
	};
}

// Fetch task instructions and render them
fetch(`/api/tasks/${taskId}`)
	.then((response) => {
		if (!response.ok) {
			throw new Error('Failed to load task');
		}
		return response.json();
	})
	.then((task) => {
		if (instructionsEl) {
			instructionsEl.textContent = task.description || 'No instructions available for this task.';
		}
	})
	.catch((error) => {
		console.error('Error loading task:', error);
	});

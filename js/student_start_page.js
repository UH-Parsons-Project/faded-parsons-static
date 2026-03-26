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

// Check if the user already started this task in the database
async function checkAndRedirectIfStarted() {
	try {
		const response = await fetch(`/api/tasks/${taskId}/check-start`);
		if (response.ok) {
			const data = await response.json();
			if (data.has_started) {
				// User has already started this task, redirect them to it
				window.history.replaceState(null, '', `/set/${uniqueLinkCode}/tasks/${taskId}`);
				window.location.href = `/set/${uniqueLinkCode}/tasks/${taskId}`;
			}
		}
	} catch (error) {
		console.error('Error checking task start status:', error);
		// Continue with showing the start page if there's an error
	}
}

// Check on page load
checkAndRedirectIfStarted();

// Set the back button to return to the task list
const backButton = document.getElementById('back-to-list');
if (backButton) {
	backButton.href = `/set/${uniqueLinkCode}/tasks`;
}

// Set the start button to navigate to the task exercise
const startBtn = document.getElementById('start-btn');
if (startBtn) {
	startBtn.onclick = async function() {
		try {
			// Record task start in the database
			const response = await fetch(`/api/tasks/${taskId}/start`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				}
			});
			
			if (!response.ok) {
				throw new Error('Failed to start task');
			}
		} catch (error) {
			console.error('Error starting task:', error);
			// Continue navigation even if recording start fails
		}
		
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
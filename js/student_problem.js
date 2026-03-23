// Set the back button to return to the task list
// Path: /set/{unique_link_code}/tasks/{task_id}
const pathParts = window.location.pathname.split('/').filter(p => p);
const uniqueLinkCode = pathParts[1];
const backButton = document.getElementById('back-to-list');
if (backButton && uniqueLinkCode) {
	backButton.href = `/set/${uniqueLinkCode}/tasks`;
}
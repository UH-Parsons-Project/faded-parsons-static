// Extract unique_link_code and task_id from URL path
// Path: /set/{unique_link_code}/tasks/{task_id}/start
const pathParts = window.location.pathname.split('/').filter(p => p);
const uniqueLinkCode = pathParts[1]; // set/starter-list/tasks/1/start -> starter-list
const taskId = pathParts[3]; // set/starter-list/tasks/1/start -> 1
const instructionsEl = document.getElementById('task-instructions');

// Set the back button to return to the task list
const backButton = document.getElementById('back-to-list');
if (backButton) {
  backButton.href = `/set/${uniqueLinkCode}/tasks`;
}

// Set the start button to navigate to the task exercise
const startBtn = document.getElementById('start-btn');
if (startBtn) {
  startBtn.onclick = function() {
    // Save start time to localStorage
    const startTime = new Date().toISOString();
    localStorage.setItem(`task-${taskId}-start-time`, startTime);
    
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

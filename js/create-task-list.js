import { initSignedInAs, initProtectedPage } from '/js/auth-ui.js';
    initSignedInAs();
    initProtectedPage('/index.html');

/**
 * Task List Creation Form Module
 * Handles form interactions, task selection, and task list creation
 */

let allTasks = [];
let selectedTaskIds = [];  // Array to preserve order
let draggedElement = null;
let viewerIdentifiers = [];

/**
 * Initialize the page when DOM is ready
 */
function initializePage() {
  loadUsername();
  setupExpirationDateToggle();
  setupTaskSearch();
  setupViewerSharing();
  setupFormSubmission();
  loadTasks();
}

/**
 * Load and display the current user's username
 */
function loadUsername() {
  const userNameEl = document.getElementById('user-name');
  const storedUsername = localStorage.getItem('username');
  
  if (storedUsername) {
    userNameEl.textContent = storedUsername;
  } else {
    fetch('/api/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        if (data?.username) {
          userNameEl.textContent = data.username;
          localStorage.setItem('username', data.username);
        }
      })
      .catch(() => { userNameEl.textContent = ''; });
  }
}

/**
 * Toggle expiration date input visibility
 */
function setupExpirationDateToggle() {
  document.getElementById('set-expiration').addEventListener('change', (e) => {
    document.getElementById('expiration-group').style.display = e.target.checked ? 'block' : 'none';
    if (!e.target.checked) {
      document.getElementById('expiration-date').value = '';
    }
  });
}

/**
 * Setup task search functionality
 */
function setupTaskSearch() {
  document.getElementById('task-search').addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    const filtered = allTasks.filter(task =>
      task.title.toLowerCase().includes(query)
    );
    renderTasks(filtered);
  });
}

function setupViewerSharing() {
  const input = document.getElementById('viewer-identifiers');
  const addBtn = document.getElementById('add-viewer-btn');
  if (!input) return;

  if (addBtn) {
    addBtn.addEventListener('click', () => {
      addViewersFromInput();
    });
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addViewersFromInput();
    }
  });

  input.addEventListener('blur', () => {
    addViewersFromInput();
  });

  renderViewerList();
}

function addViewersFromInput() {
  const input = document.getElementById('viewer-identifiers');
  if (!input) return;

  const raw = input.value;
  if (!raw) return;

  const tokens = raw
    .split(/[,\n;]/)
    .map(token => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) return;

  tokens.forEach(addViewerIdentifier);
  input.value = '';
  renderViewerList();
}

function addViewerIdentifier(identifier) {
  const normalized = identifier.trim();
  if (!normalized) return;

  const exists = viewerIdentifiers.some(
    existing => existing.toLowerCase() === normalized.toLowerCase()
  );

  if (!exists) {
    viewerIdentifiers.push(normalized);
  }
}

function removeViewerIdentifier(identifier) {
  viewerIdentifiers = viewerIdentifiers.filter(
    existing => existing.toLowerCase() !== identifier.toLowerCase()
  );
  renderViewerList();
}







function renderViewerList() {
  const container = document.getElementById('viewer-list');
  if (!container) return;

  if (viewerIdentifiers.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = '';
  viewerIdentifiers.forEach(identifier => {
    const item = document.createElement('div');
    item.className = 'd-flex align-items-center mb-1';

    const label = document.createElement('span');
    label.className = 'badge badge-light border mr-2';
    label.innerHTML = escapeHtml(identifier);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn btn-link btn-sm text-danger p-0';
    removeBtn.title = 'Remove viewer';
    removeBtn.innerHTML = '<i class="fas fa-times"></i>';
    removeBtn.addEventListener('click', () => removeViewerIdentifier(identifier));

    item.appendChild(label);
    item.appendChild(removeBtn);
    container.appendChild(item);
  });
}

/**
 * Load tasks from the backend API
 */
async function loadTasks() {
  const loadingEl = document.getElementById('tasks-loading');
  loadingEl.style.display = 'flex';

  try {
    const response = await fetch('/api/tasks', { credentials: 'include' });
    if (!response.ok) throw new Error('Failed to load tasks');
    allTasks = await response.json();
    renderTasks(allTasks);
  } catch (error) {
    console.error('Error loading tasks:', error);
    showError('Failed to load tasks. Please try again.');
  } finally {
    loadingEl.style.display = 'none';
  }
}

/**
 * Render available tasks in the task selector
 */
function renderTasks(tasks) {
  const selector = document.getElementById('task-selector');
  selector.innerHTML = '';

  if (tasks.length === 0) {
    selector.innerHTML = '<p class="text-muted">No tasks available</p>';
    return;
  }

  tasks.forEach(task => {
    const taskEl = document.createElement('div');
    taskEl.className = 'task-item';
    if (selectedTaskIds.includes(task.id)) {
      taskEl.classList.add('selected');
    }

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selectedTaskIds.includes(task.id);
    checkbox.addEventListener('change', (e) => {
      handleTaskSelection(task.id, e.target.checked);
    });

    const content = document.createElement('div');
    content.className = 'task-item-content';

    const title = document.createElement('div');
    title.className = 'task-item-title';
    title.textContent = task.title;

    const type = document.createElement('div');
    type.className = 'task-item-type';
    type.textContent = `Type: ${task.task_type}`;

    content.appendChild(title);
    content.appendChild(type);

    const actions = document.createElement('div');
    actions.className = 'task-item-actions';

    const previewBtn = document.createElement('button');
    previewBtn.type = 'button';
    previewBtn.className = 'preview-btn';
    previewBtn.innerHTML = '<i class="fas fa-eye"></i> Preview';
    previewBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openTaskPreview(task);
    });

    actions.appendChild(previewBtn);

    taskEl.appendChild(checkbox);
    taskEl.appendChild(content);
    taskEl.appendChild(actions);

    taskEl.addEventListener('click', (e) => {
      if (e.target !== checkbox && !e.target.closest('.task-item-actions')) {
        checkbox.checked = !checkbox.checked;
        handleTaskSelection(task.id, checkbox.checked);
      }
    });

    selector.appendChild(taskEl);
  });
}

/**
 * Handle task selection/deselection
 */
function handleTaskSelection(taskId, isSelected) {
  if (isSelected) {
    if (!selectedTaskIds.includes(taskId)) {
      selectedTaskIds.push(taskId);
    }
  } else {
    selectedTaskIds = selectedTaskIds.filter(id => id !== taskId);
  }
  updateSelectedTasksPreview();
  renderTasks(allTasks); // Re-render to update checked state
}

/**
 * Update the selected tasks preview list
 */
function updateSelectedTasksPreview() {
  const listEl = document.getElementById('selected-tasks-list');
  const countEl = document.getElementById('selected-count');

  countEl.textContent = selectedTaskIds.length;

  if (selectedTaskIds.length === 0) {
    listEl.innerHTML = '<div class="empty-selected">No tasks selected yet</div>';
    return;
  }

  listEl.innerHTML = '';
  selectedTaskIds.forEach((taskId, index) => {
    const task = allTasks.find(t => t.id === taskId);
    if (!task) return;

    const itemEl = document.createElement('div');
    itemEl.className = 'selected-task-item';
    itemEl.draggable = true;
    itemEl.dataset.taskId = taskId;

    const dragHandle = document.createElement('span');
    dragHandle.className = 'drag-handle';
    dragHandle.innerHTML = '<i class="fas fa-bars"></i>';

    const contentEl = document.createElement('div');
    contentEl.className = 'selected-task-item-content';

    const positionEl = document.createElement('div');
    positionEl.style.fontSize = '0.75rem';
    positionEl.style.color = '#6c757d';
    positionEl.style.marginBottom = '0.25rem';
    positionEl.textContent = `#${index + 1}`;

    const titleEl = document.createElement('div');
    titleEl.className = 'selected-task-item-title';
    titleEl.textContent = task.title;

    const typeEl = document.createElement('div');
    typeEl.className = 'selected-task-item-type';
    typeEl.textContent = task.task_type;

    contentEl.appendChild(positionEl);
    contentEl.appendChild(titleEl);
    contentEl.appendChild(typeEl);

    const controlsEl = document.createElement('div');
    controlsEl.className = 'selected-task-item-controls';

    const previewBtn = document.createElement('button');
    previewBtn.type = 'button';
    previewBtn.className = 'preview-btn';
    previewBtn.innerHTML = '<i class="fas fa-eye"></i>';
    previewBtn.title = 'Preview task';
    previewBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openTaskPreview(task);
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-task-btn';
    removeBtn.type = 'button';
    removeBtn.innerHTML = '<i class="fas fa-trash"></i>';
    removeBtn.title = 'Remove task';
    removeBtn.addEventListener('click', () => {
      handleTaskSelection(taskId, false);
    });

    controlsEl.appendChild(previewBtn);
    controlsEl.appendChild(removeBtn);

    itemEl.appendChild(dragHandle);
    itemEl.appendChild(contentEl);
    itemEl.appendChild(controlsEl);

    // Drag event handlers
    itemEl.addEventListener('dragstart', () => {
      draggedElement = itemEl;
      itemEl.classList.add('dragging');
    });

    itemEl.addEventListener('dragend', () => {
      itemEl.classList.remove('dragging');
      draggedElement = null;
    });

    itemEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (draggedElement && draggedElement !== itemEl) {
        itemEl.classList.add('drag-over');
      }
    });

    itemEl.addEventListener('dragleave', () => {
      itemEl.classList.remove('drag-over');
    });

    itemEl.addEventListener('drop', (e) => {
      e.preventDefault();
      itemEl.classList.remove('drag-over');

      if (draggedElement && draggedElement !== itemEl) {
        const draggedIndex = selectedTaskIds.findIndex(
          id => id === parseInt(draggedElement.dataset.taskId)
        );
        const targetTaskId = parseInt(itemEl.dataset.taskId);

        if (draggedIndex !== -1) {
          // Remove the dragged item from its current position
          const draggedTaskId = selectedTaskIds[draggedIndex];
          selectedTaskIds.splice(draggedIndex, 1);
          
          // Find the target item's new index after removal
          const newTargetIndex = selectedTaskIds.findIndex(id => id === targetTaskId);
          
          // Insert the dragged item before the target item
          if (newTargetIndex !== -1) {
            selectedTaskIds.splice(newTargetIndex, 0, draggedTaskId);
          } else {
            // If target not found, append to end
            selectedTaskIds.push(draggedTaskId);
          }
          
          updateSelectedTasksPreview();
        }
      }
    });

    listEl.appendChild(itemEl);
  });
}

/**
 * Open task preview in a new window
 */
function openTaskPreview(task) {
  const previewWindow = window.open(
    `/problem.html?id=${task.id}`,
    '_blank',
    'width=1000,height=800,resizable=yes,scrollbars=yes'
  );
  previewWindow.focus();
}

/**
 * Show error message
 */
function showError(message) {
  const container = document.getElementById('error-container');
  container.innerHTML = `<div class="error-message"><i class="fas fa-exclamation-circle"></i> ${message}</div>`;
  // Scroll to error message
  window.scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(() => {
    container.innerHTML = '';
  }, 5000);
}

/**
 * Show duplicate title error modal
 */
function showDuplicateTitleModal(title) {
  const messageP = document.getElementById('duplicate-error-message');
  messageP.innerHTML = `A task list with the title "<strong style="color: #dc3545;">${escapeHtml(title)}</strong>" already exists. Please choose a different name.`;

  // Scroll to top to show the modal
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Show the Bootstrap modal after a brief delay to ensure scroll completes
  setTimeout(() => {
    toggleDuplicateTitleModal(true);
  }, 300);

  // Focus back to the title input for easy editing after a brief delay
  setTimeout(() => {
    document.getElementById('task-list-title').focus();
    document.getElementById('task-list-title').select();
  }, 500);
}

function toggleDuplicateTitleModal(show) {
  const modalEl = document.getElementById('duplicate-title-modal');
  if (!modalEl) return;

  // Bootstrap 4 modal API via jQuery when available.
  if (window.jQuery) {
    window.jQuery(modalEl).modal(show ? 'show' : 'hide');
    return;
  }

  // Graceful fallback if jQuery is unavailable.
  modalEl.style.display = show ? 'block' : 'none';
  modalEl.classList.toggle('show', show);
  modalEl.setAttribute('aria-hidden', show ? 'false' : 'true');
}

/**
 * Close duplicate title modal
 */
function closeDuplicateTitleModal() {
  toggleDuplicateTitleModal(false);
  document.getElementById('task-list-title').focus();
}

window.closeDuplicateTitleModal = closeDuplicateTitleModal;

/**
 * Show success message
 */
function showSuccess(message) {
  const container = document.getElementById('error-container');
  container.innerHTML = `<div class="success-message"><i class="fas fa-check-circle"></i> ${message}</div>`;
  // Scroll to success message
  container.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => {
    container.innerHTML = '';
  }, 3000);
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Setup form submission
 */
function setupFormSubmission() {
  document.getElementById('create-task-list-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const title = document.getElementById('task-list-title').value.trim();
    const studentDescription = document.getElementById('student-description').value.trim();
    const teacherDescription = document.getElementById('teacher-description').value.trim();
    const expirationDate = document.getElementById('set-expiration').checked
      ? document.getElementById('expiration-date').value
      : null;

    addViewersFromInput();
    const viewersToShare = [...viewerIdentifiers];

    if (!title) {
      showError('Please enter a task list title');
      return;
    }

    if (selectedTaskIds.length === 0) {
      showError('Please select at least one task');
      return;
    }

    const submitBtn = document.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';

    try {
      // Create task list
      const createResponse = await fetch('/api/task_lists', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title,
          student_description: studentDescription || null,
          teacher_description: teacherDescription || null,
          expires_at: expirationDate ? new Date(expirationDate).toISOString() : null,
          task_ids: selectedTaskIds
        })
      });

      if (!createResponse.ok) {
        const error = await createResponse.json();
        const errorDetail = error.detail || 'Failed to create task list';

        // Check if this is a duplicate title error
        if (errorDetail.includes('already exists') || errorDetail.includes('title')) {
          showDuplicateTitleModal(title);
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fas fa-save"></i> Create Task List';
          return;
        }

        throw new Error(errorDetail);
      }

      const createdList = await createResponse.json();

      const viewerErrors = [];
      for (const identifier of viewersToShare) {
        try {
          const viewerResponse = await fetch(`/api/problemsets/${createdList.id}/viewers`, {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ identifier })
          });

          if (!viewerResponse.ok) {
            const viewerError = await viewerResponse.json().catch(() => null);
            const detail = viewerError?.detail || `HTTP ${viewerResponse.status}`;
            viewerErrors.push(`${identifier} (${detail})`);
          }
        } catch (error) {
          viewerErrors.push(`${identifier} (network error)`);
        }
      }

      let successMessage = 'Task list created successfully!';
      if (viewerErrors.length > 0) {
        successMessage += ` Viewers not added: ${viewerErrors.join(', ')}.`;
      }
      showSuccess(successMessage);

      setTimeout(() => {
        window.location.href = `/task_list_selector`;
      }, 1500);
    } catch (error) {
      console.error('Error creating task list:', error);
      showError(error.message || 'Failed to create task list');
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-save"></i> Create Task List';
    }
  });
}

/**
 * Initialize when DOM is ready
 */
document.addEventListener('DOMContentLoaded', initializePage);
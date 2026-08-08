import { initSignedInAs, initProtectedPage, initBurgerMenu } from '../core/auth-ui.js';
import { createPrivateBadge, isPrivateTask } from '../components/privacy-badge.js';
import { escapeHtml, showError } from '../utils/ui-utils.js';
    initSignedInAs();
    initProtectedPage('/');
    initBurgerMenu();

/**
 * Task Set Creation Form Module
 * Handles form interactions, task selection, and task set creation
 */

let allTasks = [];
let selectedTaskIds = [];  // Array to preserve order
let draggedElement = null;
let currentTeacherId = null;
let currentTeacherUsername = '';

const activeTaskFilters = {
  query: '',
  activeScope: null
};

/**
 * Initialize the page when DOM is ready
 */
function initializePage() {
  loadUsername();
  setupExpirationDateToggle();
  setupTaskSearch();
  setupViewerSharing();
  setupFormSubmission();
  setupCancelButton();
  loadTasks();
}

/**
 * Confirm before discarding the in-progress task set and returning to the dashboard.
 */
function setupCancelButton() {
  const cancelLink = document.getElementById('cancel-task-set');
  if (!cancelLink) return;

  cancelLink.addEventListener('click', (e) => {
    e.preventDefault();
    const confirmed = window.confirm(
      'Are you sure you want to cancel? Any unsaved changes will be lost.'
    );
    if (!confirmed) {
      return;
    }
    window.location.href = cancelLink.href;
  });
}

/**
 * Load and display the current user's username
 */
function loadUsername() {
  const userNameEl = document.getElementById('user-name');
  const storedUsername = localStorage.getItem('username');
  const storedUserId = localStorage.getItem('userId');

  if (storedUserId) {
    const parsedId = Number.parseInt(storedUserId, 10);
    if (!Number.isNaN(parsedId)) {
      currentTeacherId = parsedId;
    }
  }

  if (storedUsername) {
    userNameEl.textContent = storedUsername;
    currentTeacherUsername = storedUsername;
  }

  fetch('/api/me', { credentials: 'include' })
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(data => {
      if (data?.username) {
        userNameEl.textContent = data.username;
        currentTeacherUsername = data.username;
        localStorage.setItem('username', data.username);
      }

      if (typeof data?.id === 'number') {
        currentTeacherId = data.id;
        localStorage.setItem('userId', String(data.id));
      }

      applyTaskFilters();
    })
    .catch(() => {
      if (!storedUsername) {
        userNameEl.textContent = '';
      }
    });
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
 * Setup task search functionality with scoped filtering
 */
function setupTaskSearch() {
  const taskSearchInput = document.getElementById('task-search');
  const scopeCheckboxes = document.querySelectorAll('.filter-scope');

  taskSearchInput.addEventListener('input', (e) => {
    activeTaskFilters.query = e.target.value.trim().toLowerCase();
    applyTaskFilters();
  });

  scopeCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      if (e.target.checked) {
        scopeCheckboxes.forEach(other => {
          if (other !== e.target) {
            other.checked = false;
          }
        });
        activeTaskFilters.activeScope = e.target.value;
      } else {
        activeTaskFilters.activeScope = null;
      }
      applyTaskFilters();
    });
  });
}

function isOwnTask(task, creatorUsername) {
  const byTeacherId =
    currentTeacherId !== null && Number(task.created_by_teacher_id) === currentTeacherId;
  const byTeacherName =
    !!currentTeacherUsername && creatorUsername === currentTeacherUsername.toLowerCase();
  return byTeacherId || byTeacherName;
}

function applyTaskFilters() {
  const query = activeTaskFilters.query;
  const activeScope = activeTaskFilters.activeScope;

  const filteredTasks = allTasks.filter(task => {
    const taskTitle = (task.title || '').toLowerCase();
    const taskType = (task.task_type || '').toLowerCase();
    const creatorUsername = (task.creator_username || '').toLowerCase();
    const ownTask = isOwnTask(task, creatorUsername);

    // If no query, return all matching my-exercises filter if selected
    if (!query) {
      if (activeScope === 'my-exercises') {
        return ownTask;
      }
      if (activeScope === 'favorites') {
        return Boolean(task.is_favorite);
      }
      return true;
    }

    // If no specific scope is selected, search all text fields.
    if (!activeScope) {
      return (
        taskTitle.includes(query) ||
        taskType.includes(query) ||
        creatorUsername.includes(query)
      );
    }

    if (activeScope === 'title') {
      return taskTitle.includes(query);
    }
    if (activeScope === 'type') {
      return taskType.includes(query);
    }
    if (activeScope === 'teacher') {
      return creatorUsername.includes(query);
    }
    if (activeScope === 'my-exercises') {
      return ownTask && (taskTitle.includes(query) || taskType.includes(query));
    }
    if (activeScope === 'favorites') {
      return Boolean(task.is_favorite) && (
        taskTitle.includes(query) || taskType.includes(query) || creatorUsername.includes(query)
      );
    }

    return false;
  });

  // Sort alphabetically by title
  filteredTasks.sort((a, b) => {
    const titleA = (a.title || '').toLowerCase();
    const titleB = (b.title || '').toLowerCase();
    return titleA.localeCompare(titleB);
  });

  renderTasks(filteredTasks);
}

// Each entry: { teacher_id, username, email }
let validatedViewers = [];

function setupViewerSharing() {
  const input = document.getElementById('viewer-identifiers');
  const addBtn = document.getElementById('add-viewer-btn');
  if (!input || !addBtn) return;

  const addHandler = async () => {
    const identifier = input.value.trim();
    if (!identifier) return;
    addBtn.disabled = true;
    input.disabled = true;
    const added = await addViewerByIdentifier(identifier);
    if (added) input.value = '';
    input.disabled = false;
    addBtn.disabled = false;
    input.focus();
  };

  addBtn.addEventListener('click', addHandler);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addHandler(); }
  });

  renderViewerList();
}

function showViewerError(message) {
  const container = document.getElementById('viewer-errors');
  if (!container) return;
  container.innerHTML = `<div class="text-danger small">${escapeHtml(message)}</div>`;
  setTimeout(() => { container.innerHTML = ''; }, 4000);
}

async function addViewerByIdentifier(identifier) {
  try {
    const response = await fetch(
      `/api/teachers/lookup?identifier=${encodeURIComponent(identifier)}`,
      { credentials: 'include' }
    );
    if (!response.ok) {
      const err = await response.json().catch(() => null);
      throw new Error(err?.detail || 'Teacher not found');
    }
    const teacher = await response.json();

    if (teacher.username.toLowerCase() === currentTeacherUsername.toLowerCase()) {
      showViewerError('You cannot add yourself as a viewer.');
      return false;
    }

    const already = validatedViewers.some(v => v.teacher_id === teacher.teacher_id);
    if (already) {
      showViewerError(`${teacher.username} is already added.`);
      return false;
    }

    validatedViewers.push(teacher);
    renderViewerList();
    return true;
  } catch (error) {
    showViewerError(error.message || 'Teacher not found');
    return false;
  }
}

function removeViewerById(teacherId) {
  validatedViewers = validatedViewers.filter(v => v.teacher_id !== teacherId);
  renderViewerList();
}




function renderViewerList() {
  const container = document.getElementById('viewer-list');
  if (!container) return;

  container.innerHTML = '';
  validatedViewers.forEach(viewer => {
    const item = document.createElement('div');
    item.className = 'd-flex align-items-center justify-content-between border rounded px-2 py-1 mb-2';

    const info = document.createElement('div');
    info.innerHTML = `<strong>${escapeHtml(viewer.username)}</strong> <span class="text-muted">(${escapeHtml(viewer.email)})</span>`;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn btn-sm btn-outline-danger';
    removeBtn.title = 'Remove viewer';
    removeBtn.innerHTML = '<i class="fas fa-trash"></i>';
    removeBtn.addEventListener('click', () => removeViewerById(viewer.teacher_id));

    item.appendChild(info);
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
    applyTaskFilters();
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

    const header = document.createElement('div');
    header.className = 'task-item-header';

    const title = document.createElement('div');
    title.className = 'task-item-title';
    title.textContent = task.title;

    const favoriteBtn = document.createElement('button');
    favoriteBtn.type = 'button';
    favoriteBtn.className = 'task-favorite-button' + (task.is_favorite ? ' is-favorite' : '');
    favoriteBtn.innerHTML = task.is_favorite ? '<i class="fas fa-star"></i>' : '<i class="far fa-star"></i>';
    favoriteBtn.title = task.is_favorite ? 'Remove from favorites' : 'Add to favorites';
    favoriteBtn.setAttribute('aria-label', favoriteBtn.title);
    favoriteBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        await toggleFavorite(task);
      } catch (error) {
        console.error('Failed to update favorite:', error);
        alert('Could not update favorite right now.');
      }
    });

    const titleWrap = document.createElement('div');
    titleWrap.style.display = 'flex';
    titleWrap.style.alignItems = 'center';
    titleWrap.style.gap = '.45rem';
    titleWrap.style.minWidth = '0';
    titleWrap.appendChild(title);
    header.appendChild(titleWrap);

    const controlsWrap = document.createElement('div');
    controlsWrap.style.display = 'flex';
    controlsWrap.style.alignItems = 'center';
    controlsWrap.style.gap = '.2rem';
    controlsWrap.style.flexShrink = '0';
    controlsWrap.appendChild(favoriteBtn);
    if (isPrivateTask(task)) {
      controlsWrap.appendChild(createPrivateBadge());
    }
    header.appendChild(controlsWrap);

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.setAttribute('aria-label', `Select task: ${task.title}`);
    checkbox.checked = selectedTaskIds.includes(task.id);
    checkbox.addEventListener('change', (e) => {
      handleTaskSelection(task.id, e.target.checked);
    });

    const content = document.createElement('div');
    content.className = 'task-item-content';

    const type = document.createElement('div');
    type.className = 'task-item-type';
    type.textContent = `Type: ${task.task_type}`;

    const createdBy = document.createElement('div');
    createdBy.className = 'task-item-meta';
    createdBy.textContent = `Created by: ${task.creator_username || 'Unknown teacher'}`;

    content.appendChild(header);
    content.appendChild(type);
    content.appendChild(createdBy);

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

async function toggleFavorite(task) {
  const shouldFavorite = !task.is_favorite;
  const response = await fetch(`/api/tasks/${encodeURIComponent(task.id)}/favorite`, {
    method: shouldFavorite ? 'POST' : 'DELETE',
    credentials: 'include'
  });

  if (!response.ok) {
    throw new Error('Failed to update favorite');
  }

  const result = await response.json();
  task.is_favorite = Boolean(result.is_favorite);
  applyTaskFilters();
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
  applyTaskFilters(); // Re-render to update checked state while preserving active filters
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

    const titleRow = document.createElement('div');
    titleRow.style.display = 'flex';
    titleRow.style.alignItems = 'center';
    titleRow.style.gap = '.45rem';
    titleRow.style.minWidth = '0';

    const titleEl = document.createElement('div');
    titleEl.className = 'selected-task-item-title';
    titleEl.textContent = task.title;
    titleRow.appendChild(titleEl);
    if (isPrivateTask(task)) {
      titleRow.appendChild(createPrivateBadge());
    }

    const typeEl = document.createElement('div');
    typeEl.className = 'selected-task-item-type';
    typeEl.textContent = task.task_type;

    contentEl.appendChild(positionEl);
    contentEl.appendChild(titleRow);
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
 * Open task preview in modal
 */
let previewParsonsWidget = null;

async function openTaskPreview(taskListItem) {
  try {
    const response = await fetch(`/api/tasks/${taskListItem.id}`, { credentials: 'include' });
    if (!response.ok) {
      throw new Error('Failed to load task details');
    }
    const task = await response.json();
    
    const modal = document.getElementById('student-preview-modal');
    const previewTaskTitle = document.getElementById('preview-task-title');
    const previewStartIntro = document.getElementById('preview-start-intro');
    const previewText = document.getElementById('preview-problem-text');
    const previewSource = document.getElementById('preview-source-sortable');
    const previewSolution = document.getElementById('preview-solution-sortable');
    const previewWrittenTests = document.getElementById('preview-written-tests');
    const previewModelAnswer = document.getElementById('preview-model-answer');
    
    if (!modal) {
      console.error('Preview modal not found.');
      return;
    }
    
    let startIntro = task.description || '';
    let problemStatement = '';
    try {
      const instr = JSON.parse(task.task_instructions || '{}');
      let baseText = instr.task_instructions || '';
      problemStatement = escapeHtml(baseText).replace(/\n/g, '<br>');
      if (instr.function_name) {
        problemStatement = `<strong>${escapeHtml(instr.function_name)}</strong><br>` + problemStatement;
      }
      if (instr.examples) {
        problemStatement += `<br><br><strong>Examples:</strong><pre style="margin-top: 0.5rem; background: #f1f5f9; padding: 0.75rem; border-radius: 6px;"><code>${escapeHtml(instr.examples)}</code></pre>`;
      }
    } catch (e) {
      problemStatement = escapeHtml(task.task_instructions || '').replace(/\n/g, '<br>');
    }
    
    const tests = task.correct_solution?.teacher_tests || '';
    const modelAnswerCode = task.model_answer || '';
    
    previewTaskTitle.innerHTML = escapeHtml(task.title || '').replace(/\n/g, '<br>');
    previewStartIntro.innerHTML = escapeHtml(startIntro).replace(/\n/g, '<br>');
    previewText.innerHTML = problemStatement;
    previewWrittenTests.textContent = tests.trim() || 'No tests written yet.';
    previewModelAnswer.textContent = modelAnswerCode.trim() || 'No model answer set yet.';
    
    previewSource.innerHTML = '';
    previewSolution.innerHTML = '';
    
    if (window.ParsonsWidget) {
      previewParsonsWidget = new window.ParsonsWidget({
        sortableId: previewSolution,
        trashId: previewSource,
        max_wrong_lines: 10,
        feedback_cb: false,
        can_indent: true,
        lang: 'en',
      });
      
      previewParsonsWidget.id_prefix = 'preview-sortable-codeline';
      
      const blocks = task.code_blocks?.blocks || [];
      const solutionCode = (task.correct_solution?.solution_code || '').replace(/\r\n/g, '\n');
      const modelAnswer = (task.model_answer || '').replace(/\r\n/g, '\n');
      const INDENT = '    ';
  
      const solLinesList = solutionCode.split('\n').map(l => l.trimRight());
      const ansLinesList = modelAnswer.split('\n').map(l => l.trimRight());
  
      // Create a list of solution line objects for sequential matching
      const solLines = solLinesList.map((solLine, idx) => ({
        solLine,
        ansLine: ansLinesList[idx] || '',
        matched: false,
      }));
  
      const previewRepr = blocks.map((block) => {
        const codeWithBlanks = block.code.replace(/___/g, '!BLANK');
        const indented = INDENT.repeat(block.indent) + block.code;
  
        // Find the first unmatched solution line that matches this block's indented code
        const matchItem = solLines.find(item => {
          if (item.matched) return false;
          return item.solLine.replace(/!BLANK/g, '___') === indented;
        });
  
        if (matchItem) {
          matchItem.matched = true;
  
          let line = `${codeWithBlanks} #${block.indent}given`;
          if (block.given) {
            line += ' #preplace';
          }
          return line;
        }
  
        return codeWithBlanks;
      }).join('\n');
      
      previewParsonsWidget.init(previewRepr);
      
      const previewSolutionIds = previewParsonsWidget.studentGiven ? previewParsonsWidget.studentGiven.map((line) => line.id) : [];
      const previewSolutionSet = new Set(previewSolutionIds);
      const previewSourceIds = previewParsonsWidget.modified_lines
        .filter((line) => !previewSolutionSet.has(line.id))
        .map((line) => line.id);
        
      previewParsonsWidget.createHTMLFromLists(previewSolutionIds, previewSourceIds);
    }
    
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    
  } catch (error) {
    console.error('Error previewing task:', error);
    alert('Could not load task preview.');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const closeBtn = document.getElementById('close-student-preview');
  const modal = document.getElementById('student-preview-modal');
  
  function closeModal() {
    if (modal) {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', closeModal);
  }
  
  if (modal) {
    modal.addEventListener('click', (event) => {
      // Close only if clicking directly on the modal backdrop, not the dialog inside
      if (event.target === modal) {
        closeModal();
      }
    });
  }
});



/**
 * Show duplicate title error modal
 */
function showDuplicateTitleModal(title) {
  const messageP = document.getElementById('duplicate-error-message');
  messageP.innerHTML = `A task set with the title "<strong style="color: #dc3545;">${escapeHtml(title)}</strong>" already exists. Please choose a different name.`;

  // Scroll to top to show the modal
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Show the Bootstrap modal after a brief delay to ensure scroll completes
  setTimeout(() => {
    toggleDuplicateTitleModal(true);
  }, 300);

  // Focus back to the title input for easy editing after a brief delay
  setTimeout(() => {
    document.getElementById('task-set-title').focus();
    document.getElementById('task-set-title').select();
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
  document.getElementById('task-set-title').focus();
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
 * Setup form submission
 */
function setupFormSubmission() {
  document.getElementById('create-task-set-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const title = document.getElementById('task-set-title').value.trim();
    const studentDescription = document.getElementById('student-description').value.trim();
    const teacherDescription = document.getElementById('teacher-description').value.trim();
    const expirationDate = document.getElementById('set-expiration').checked
      ? document.getElementById('expiration-date').value
      : null;

    const viewersToShare = [...validatedViewers];

    if (!title) {
      showError('Please enter a task set title');
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
      // Create task set
      const createResponse = await fetch('/api/create_task_set', {
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
        const error = await createResponse.json().catch(() => null);
        const errorDetail = error?.detail || 'Failed to create task set';

        // Check if this is a duplicate title error
        if (errorDetail.includes('already exists') || errorDetail.includes('title')) {
          showDuplicateTitleModal(title);
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fas fa-save"></i> Create Task Set';
          return;
        }

        throw new Error(errorDetail);
      }

      const createdList = await createResponse.json();

      const viewerErrors = [];
      for (const viewer of viewersToShare) {
        try {
          const viewerResponse = await fetch(`/api/my_sets/${createdList.id}/viewers`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: viewer.username })
          });

          if (!viewerResponse.ok) {
            const viewerError = await viewerResponse.json().catch(() => null);
            const detail = viewerError?.detail || `HTTP ${viewerResponse.status}`;
            viewerErrors.push(`${viewer.username} (${detail})`);
          }
        } catch (error) {
          viewerErrors.push(`${viewer.username} (network error)`);
        }
      }

      let successMessage = 'Task list created successfully!';
      if (viewerErrors.length > 0) {
        successMessage += ` Viewers not added: ${viewerErrors.join(', ')}.`;
      }
      showSuccess(successMessage);

      setTimeout(() => {
        window.location.href = `/teacher-dashboard`;
      }, 1500);
    } catch (error) {
      console.error('Error creating task set:', error);
      showError(error.message || 'Failed to create task set');
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-save"></i> Create Task Set';
    }
  });
}

/**
 * Initialize when DOM is ready
 */
document.addEventListener('DOMContentLoaded', initializePage);

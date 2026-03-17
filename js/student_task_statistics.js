import { loadUsername, formatDateTime, escapeHtml, showError } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
    loadUsername('user-name');
    setupBackButton();
    setupToggle();
    loadStatistics();
});

const params = new URLSearchParams(window.location.search);
const studentUsername = params.get('student');
const taskId = params.get('task_id');
const listId = params.get('list_id');

if (!studentUsername || !taskId || !listId) {
  window.location.href = '/task_list_selector';
}

function setupBackButton() {
    document.getElementById('back-btn').href = `/student_attempts?student=${encodeURIComponent(studentUsername)}&list_id=${listId}`;
}

function formatTime(seconds) {
  if (!seconds) return '0s';
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function renderHeader(data) {
  const container = document.getElementById('page-header');
  container.className = 'mb-4';
  container.innerHTML = `
    <h2>${escapeHtml(data.task_name)}</h2>
    <p class="text-muted">Student: <strong>${escapeHtml(data.student_username)}</strong></p>
  `;
}

function renderTaskInstructions(taskInstructions) {
  console.log('Task instructions received:', taskInstructions);
  const box = document.getElementById('task-instructions-box');
  const content = document.getElementById('task-instructions-content');

  if (!taskInstructions || !taskInstructions.trim()) {
    box.style.display = 'none';
    return;
  }

  let parsedInstructions = {};
  try {
    parsedInstructions = typeof taskInstructions === 'string'
      ? JSON.parse(taskInstructions)
      : taskInstructions;
  } catch (e) {
    content.innerHTML = taskInstructions;
    box.style.display = 'block';
    return;
  }

  let html = '';
  if (parsedInstructions.function_name) {
    html += `<strong>${escapeHtml(parsedInstructions.function_name)}</strong>`;
  }
  if (parsedInstructions.task_instructions) {
    html += ` ${escapeHtml(parsedInstructions.task_instructions)}`;
  }
  if (parsedInstructions.examples) {
    html += `<br><pre><code>${escapeHtml(parsedInstructions.examples)}</code></pre>`;
  }

  content.innerHTML = html;
  box.style.display = 'block';
}

function createAttemptItem(attempt) {
  const item = document.createElement('div');
  item.className = `attempt-item ${attempt.success ? 'success' : 'failure'}`;

  const header = document.createElement('div');
  header.className = 'attempt-header';
  header.innerHTML = `
    <span class="attempt-number">Attempt #${attempt.attempt_number}</span>
    <span class="attempt-badge ${attempt.success ? 'success' : 'failure'}">
      ${attempt.success ? 'Success' : 'Failed'}
    </span>
  `;

  const meta = document.createElement('div');
  meta.className = 'attempt-meta';
  meta.innerHTML = `
    Completed: ${formatDateTime(attempt.completed_at)}
    ${attempt.time_taken !== null ? ` • Time: ${formatTime(attempt.time_taken)}` : ''}
  `;

  item.appendChild(header);
  item.appendChild(meta);

  if (attempt.code) {
    const codeLabel = document.createElement('div');
    codeLabel.className = 'stat-label mt-2 mb-1';
    codeLabel.textContent = 'Submitted Code:';

    const code = document.createElement('div');
    code.className = 'attempt-code';
    code.textContent = attempt.code;

    item.appendChild(codeLabel);
    item.appendChild(code);
  }

  return item;
}

function renderAttempts(attempts) {
  const attemptsList = document.getElementById('attempts-list');
  const attemptsCount = document.getElementById('attempts-count');

  attemptsCount.textContent = attempts.length;

  if (attempts.length === 0) {
    attemptsList.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-clipboard"></i>
        <h4>No Attempts Found</h4>
        <p>This student hasn't attempted this task yet.</p>
      </div>
    `;
  } else {
    attemptsList.innerHTML = '';
    attempts.forEach(attempt => {
      attemptsList.appendChild(createAttemptItem(attempt));
    });
  }
}

function renderStatistics(data) {
  document.getElementById('stat-total').textContent = data.total_attempts;
  document.getElementById('stat-success').textContent = data.successful_attempts;
  document.getElementById('stat-failed').textContent = data.failed_attempts;

  if (data.empty_attempts && data.empty_attempts > 0) {
    document.getElementById('empty-attempts-item').style.display = 'flex';
    document.getElementById('stat-empty').textContent = data.empty_attempts;
  }

  if (data.time_to_first_success) {
    document.getElementById('time-to-success-box').style.display = 'block';
    document.getElementById('time-to-success').textContent =
      formatTime(data.time_to_first_success.seconds);
  }

  if (data.time_to_first_fail) {
    document.getElementById('time-to-fail-box').style.display = 'block';
    document.getElementById('time-to-fail').textContent =
      formatTime(data.time_to_first_fail.seconds);
  }
}

function setupToggle() {
    const attemptsHeader = document.getElementById('attempts-header');
    const attemptsList = document.getElementById('attempts-list');
    const expandIcon = document.getElementById('expand-icon');

    attemptsHeader.addEventListener('click', () => {
      attemptsList.classList.toggle('expanded');
      expandIcon.classList.toggle('expanded');
    });
}

function loadStatistics() {
    fetch(`/api/students/${encodeURIComponent(studentUsername)}/tasks/${taskId}/statistics?list_id=${listId}`, {
      credentials: 'include'
    })
      .then(r => {
        if (!r.ok) {
          if (r.status === 401) {
            window.location.href = '/index.html';
            return;
          }
          throw new Error('Failed to load statistics');
        }
        return r.json();
      })
      .then(data => {
        renderHeader(data);
        renderTaskInstructions(data.task_instructions);
        renderAttempts(data.attempts_detail);
        renderStatistics(data);
        document.getElementById('content-container').style.display = 'block';
      })
      .catch(err => {
        console.error('Error loading statistics:', err);
        if (err.message && err.message.includes('401')) {
          window.location.href = '/index.html';
        } else {
          showError(err.message || 'An unexpected error occurred.', 'page-header');
        }
      });
}
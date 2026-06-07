import { initProtectedPage, initSignedInAs, initBurgerMenu } from '/js/auth-ui.js';

initProtectedPage('/');
initSignedInAs();
initBurgerMenu();

// ─── URL params ────────────────────────────────────────────────────────────
const params = new URLSearchParams(window.location.search);
const setId  = params.get('set_id');

if (!setId) {
  window.location.href = '/teacher-dashboard';
}

document.getElementById('back-to-overview').href =
  `/task-set-overview?set_id=${setId}`;

// ─── Helpers ───────────────────────────────────────────────────────────────
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function fetchJsonWithError(path, failureMessage) {
  const response = await fetch(path, { credentials: 'include' });
  if (!response.ok) {
    let detail = response.statusText || failureMessage;
    try {
      const body = await response.json();
      detail = body?.detail || body?.message || detail;
    } catch (_) { /* ignore */ }
    throw new Error(`${failureMessage}: ${response.status} ${detail}`);
  }
  return response.json();
}

function daysAgo(isoString) {
  if (!isoString) return null;
  const diff = Date.now() - new Date(isoString).getTime();
  return Math.floor(diff / 86_400_000);
}

function progColor(ratio) {
  if (ratio >= 0.75) return 'var(--green)';
  if (ratio >= 0.40) return 'var(--amber)';
  return 'var(--red)';
}

// ─── Task preview modal ────────────────────────────────────────────────────
const modal        = document.getElementById('hm-modal-overlay');
const modalTitle   = document.getElementById('hm-modal-title');
const modalBody    = document.getElementById('hm-modal-body');
const modalFooter  = document.getElementById('hm-modal-footer');
const modalClose   = document.getElementById('hm-modal-close');

function openModal() { modal.classList.add('open'); }
function closeModal() { modal.classList.remove('open'); }

modalClose.addEventListener('click', closeModal);
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

async function openTaskPreview(task, taskSet) {
  modalTitle.textContent = task.title;
  modalBody.innerHTML = `<div class="hm-modal-loading"><i class="fas fa-spinner fa-spin"></i> Loading…</div>`;
  modalFooter.innerHTML = '';
  openModal();

  const statsUrl = `/task-statistics?id=${task.id}&task_set=${encodeURIComponent(taskSet.unique_link_code)}&set_id=${setId}`;
  modalFooter.innerHTML = `
    <a href="${statsUrl}" class="hm-modal-btn-stats" target="_blank">
      <i class="fas fa-chart-bar"></i> View Task Statistics
    </a>
    <button class="hm-modal-btn-cancel" id="hm-modal-cancel">Close</button>
  `;
  document.getElementById('hm-modal-cancel').addEventListener('click', closeModal);

  try {
    const [stats, taskData] = await Promise.all([
      fetchJsonWithError(
        `/api/tasks/${task.id}/statistics?task_set_code=${encodeURIComponent(taskSet.unique_link_code)}`,
        'Failed to load task statistics'
      ),
      fetchJsonWithError(`/api/tasks/${task.id}`, 'Failed to load task'),
    ]);
    const modelAnswer = stats.model_answer || '';
    let parsed = null;
    try { parsed = JSON.parse(taskData.task_instructions); } catch (_) { /* not JSON */ }
    const instrText  = parsed?.task_instructions || taskData.task_instructions || '';
    const examples   = parsed?.examples || '';

    let bodyHtml = '';
    if (instrText) {
      bodyHtml += `
        <div class="hm-modal-section-label">Task Instructions</div>
        <div class="hm-modal-description">${escapeHtml(instrText)}</div>
      `;
    }
    if (examples) {
      bodyHtml += `
        <div class="hm-modal-section-label" style="margin-top:.75rem">Examples</div>
        <pre class="hm-modal-code" style="max-height:140px">${escapeHtml(examples)}</pre>
      `;
    }
    bodyHtml += `
      <div class="hm-modal-section-label" style="margin-top:.75rem">Model Answer</div>
      <pre class="hm-modal-code">${escapeHtml(modelAnswer || '(no model answer available)')}</pre>
    `;
    modalBody.innerHTML = bodyHtml;
  } catch (err) {
    modalBody.innerHTML = `<div class="hm-modal-loading" style="color:var(--red)"><i class="fas fa-exclamation-triangle"></i> ${escapeHtml(err.message)}</div>`;
  }
}

// ─── Sort state ────────────────────────────────────────────────────────────
let currentSort = 'name';

function sortStudents(students, mode) {
  const arr = [...students];
  const countStatus  = (s, st) => s.cells.filter(c => c.status === st).length;
  const uncompleted  = s => s.cells.filter(c => c.status !== 'completed').length;
  const attemptsOnUncompleted = s => s.cells.filter(c => c.status !== 'completed').reduce((sum, c) => sum + (c.attempts || 0), 0);

  if (mode === 'name') return arr.sort((a, b) => a.username.localeCompare(b.username));
  if (mode === 'most' || mode === 'least') {
    arr.sort((a, b) => {
      const cmp1 = countStatus(b, 'completed') - countStatus(a, 'completed');
      if (cmp1 !== 0) return cmp1;
      const cmp2 = uncompleted(a) - uncompleted(b);
      if (cmp2 !== 0) return cmp2;
      return attemptsOnUncompleted(b) - attemptsOnUncompleted(a);
    });
    return mode === 'least' ? arr.reverse() : arr;
  }
  return arr;
}


// ─── Render: header ────────────────────────────────────────────────────────
function renderHeader(taskSet) {
  const container = document.getElementById('heatmap-header');
  container.className = '';
  container.innerHTML = `
    <div class="header-inner">
      <div class="header-left">
        <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.4rem;">
          <div class="taskset-page-title" style="margin-bottom:0">${escapeHtml(taskSet.title)}</div>
          <a href="/task-set-overview?set_id=${setId}"
             class="btn btn-sm"
             style="background:var(--brand);border:1.5px solid var(--brand-dark);color:var(--brand-text);font-weight:700;font-size:.8rem;display:inline-flex;align-items:center;gap:.35rem;white-space:nowrap;">
            <i class="fas fa-arrow-left"></i> Task Overview
          </a>
        </div>
      </div>
    </div>
  `;
}

// ─── Render: controls bar ──────────────────────────────────────────────────
function renderControls(tasks, students, onSort) {
  const container = document.getElementById('hm-controls');
  container.innerHTML = `
    <span class="hm-controls-label">Sort by</span>
    <div class="hm-sort-group" id="hm-sort-group">
      <button class="hm-sort-btn active" data-sort="name">Name A→Z</button>
      <button class="hm-sort-btn" data-sort="most">Most complete</button>
      <button class="hm-sort-btn" data-sort="least">Least complete</button>
    </div>
  `;
  container.querySelector('#hm-sort-group').addEventListener('click', e => {
    const btn = e.target.closest('.hm-sort-btn');
    if (!btn) return;
    container.querySelectorAll('.hm-sort-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentSort = btn.dataset.sort;
    onSort();
  });
}


// ─── Render: legend ────────────────────────────────────────────────────────
function renderLegend() {
  document.getElementById('hm-legend').innerHTML = `
    <span class="hm-legend-title">Status</span>
    <span class="hm-legend-item"><span class="hm-swatch hm-s-completed"></span>Completed</span>
    <span class="hm-legend-item"><span class="hm-swatch hm-s-in_progress"></span>In progress <span style="font-size:.7rem;opacity:.6;margin-left:.2rem;">(# = attempts)</span></span>
    <span class="hm-legend-item"><span class="hm-swatch hm-s-struggling"></span>Struggling <span style="font-size:.7rem;opacity:.6;margin-left:.2rem;">(# = attempts)</span></span>
    <span class="hm-legend-item"><span class="hm-swatch hm-s-not_started"></span>Not started</span>
    <span class="hm-legend-note">Click any cell to view student × task detail</span>
  `;
}

// ─── Tooltip ───────────────────────────────────────────────────────────────
const tooltip = document.getElementById('hm-tooltip');
let ttVisible  = false;

const STATUS_LABELS = {
  completed:   { label: 'Completed',   color: 'var(--green)' },
  in_progress: { label: 'In Progress', color: 'var(--amber)' },
  struggling:  { label: 'Struggling',  color: 'var(--red)'   },
  not_started: { label: 'Not Started', color: 'var(--gray)'  },
};

function showTooltip(e, student, taskIdx, tasks) {
  const cell = student.cells[taskIdx];
  const task = tasks[taskIdx];
  const sm   = STATUS_LABELS[cell.status];
  const days = daysAgo(cell.last_active_at);
  const lastStr = days === null ? '—' : days === 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`;
  const attStr  = cell.attempts > 0 ? `${cell.attempts} attempt${cell.attempts !== 1 ? 's' : ''}` : 'No attempts yet';

  tooltip.innerHTML = `
    <div class="tt-header">${escapeHtml(student.username)}</div>
    <div class="tt-status-row">
      <span class="tt-dot" style="background:${sm.color}"></span>
      <span class="tt-status-label">${sm.label}</span>
    </div>
    <div class="tt-meta">${escapeHtml(task.title)}</div>
    <div class="tt-meta">${attStr}</div>
    <div class="tt-meta">Last active: ${lastStr}</div>
    <span class="tt-hint">Click to view details →</span>
  `;
  positionTooltip(e);
  tooltip.classList.add('visible');
  ttVisible = true;
}

function hideTooltip()      { tooltip.classList.remove('visible'); ttVisible = false; }
function positionTooltip(e) {
  const pad = 14, tw = tooltip.offsetWidth || 210, th = tooltip.offsetHeight || 140;
  let x = e.clientX + pad, y = e.clientY + pad;
  if (x + tw > window.innerWidth  - 8) x = e.clientX - tw - pad;
  if (y + th > window.innerHeight - 8) y = e.clientY - th - pad;
  tooltip.style.left = x + 'px';
  tooltip.style.top  = y + 'px';
}

// ─── Render: table ─────────────────────────────────────────────────────────
let _taskSet = null;

function renderTable(tasks, students) {
  const sorted = sortStudents(students, currentSort);
  const n      = sorted.length;

  const colRates = tasks.map((_, ti) => {
    const done = students.filter(s => s.cells[ti]?.status === 'completed').length;
    return n > 0 ? done / n : 0;
  });

  // ── THEAD ──────────────────────────────────────────
  let thead = '<thead>';

  thead += '<tr>';
  thead += '<th class="hm-corner-th">Student</th>';
  tasks.forEach((task, ti) => {
    thead += `<th class="hm-task-th" data-task-idx="${ti}" title="Click to preview task: ${escapeHtml(task.title)}">
      <span class="hm-th-num">T${ti + 1}</span>
      <span class="hm-th-name">${escapeHtml(task.title)}</span>
      <span class="hm-th-peek"><i class="fas fa-eye"></i></span>
    </th>`;
  });
  thead += '<th class="hm-progress-th">Progress</th>';
  thead += '</tr>';

  thead += '<tr>';
  thead += '<th class="hm-corner-th hm-corner-rate">Completion rate</th>';
  tasks.forEach((_, ti) => {
    const pct   = Math.round(colRates[ti] * 100);
    const color = progColor(colRates[ti]);
    thead += `<th class="hm-rate-th">
      <span class="hm-rate-num" style="color:${color}">${pct}%</span>
      <div class="hm-rate-bar"><div style="width:${pct}%;background:${color};height:100%;border-radius:2px;"></div></div>
    </th>`;
  });
  thead += '<th class="hm-progress-th hm-progress-rate-th"></th>';
  thead += '</tr>';
  thead += '</thead>';

  // ── TBODY ──────────────────────────────────────────
  let tbody = '<tbody>';

  sorted.forEach(student => {
    const doneCount = student.cells.filter(c => c.status === 'completed').length;
    const ratio     = tasks.length > 0 ? doneCount / tasks.length : 0;
    const pct       = Math.round(ratio * 100);
    const strCount  = student.cells.filter(c => c.status === 'struggling').length;
    let   badgeHTML = '';
    if (strCount >= 3) {
      badgeHTML = `<span class="hm-student-badge hm-badge-red">struggling</span>`;
    }

    tbody += `<tr class="hm-student-row">`;
    tbody += `<td class="hm-student-td">
      <a class="hm-student-link" href="/student-attempts?student=${encodeURIComponent(student.username)}&set_id=${setId}">${escapeHtml(student.username)}</a>
      ${badgeHTML}
    </td>`;

    student.cells.forEach((cell, ti) => {
      const stClass = `hm-st-${cell.status}`;

      let   inner   = '';
      if (cell.status === 'completed') inner = '<i class="fas fa-check" style="font-size:.62rem;"></i>';
      else if (cell.attempts > 0)      inner = String(cell.attempts);

      tbody += `<td class="hm-cell-td" data-student="${escapeHtml(student.username)}" data-task-idx="${ti}">
        <div class="hm-cell-inner ${stClass}">${inner}</div>
      </td>`;
    });

    tbody += `<td class="hm-prog-td">
      <div class="hm-prog-bar-wrap"><div class="hm-prog-bar-fill" style="width:${pct}%;background:${progColor(ratio)};"></div></div>
      <span class="hm-prog-count" style="color:${progColor(ratio)}">${doneCount}&thinsp;/&thinsp;${tasks.length}</span>
    </td>`;
    tbody += '</tr>';
  });

  tbody += '</tbody>';

  const table = document.getElementById('hm-table');
  table.innerHTML = thead + tbody;

  table.querySelectorAll('.hm-task-th[data-task-idx]').forEach(th => {
    th.addEventListener('click', () => {
      const ti = parseInt(th.dataset.taskIdx);
      openTaskPreview(tasks[ti], _taskSet);
    });
  });

  table.querySelectorAll('.hm-cell-td').forEach(td => {
    td.addEventListener('mouseenter', e => {
      const s  = sorted.find(st => st.username === td.dataset.student);
      const ti = parseInt(td.dataset.taskIdx);
      if (s) showTooltip(e, s, ti, tasks);
    });
    td.addEventListener('mousemove', e => { if (ttVisible) positionTooltip(e); });
    td.addEventListener('mouseleave', hideTooltip);
    td.addEventListener('click', () => {
      const s  = sorted.find(st => st.username === td.dataset.student);
      const ti = parseInt(td.dataset.taskIdx);
      if (s) {
        window.location.href =
          `/student-task-statistics?student=${encodeURIComponent(s.username)}&task_id=${tasks[ti].id}&set_id=${setId}`;
      }
    });
  });
}

// ─── Error state ───────────────────────────────────────────────────────────
function showError(message) {
  const container = document.getElementById('heatmap-header');
  container.className = 'empty-state';
  container.innerHTML = `
    <i class="fas fa-exclamation-triangle text-danger"></i>
    <h4>Error Loading Heatmap</h4>
    <p>${escapeHtml(message || 'An unexpected error occurred.')}</p>
    <a href="/task-set-overview?set_id=${setId}" class="btn btn-primary mt-3">Back to Task Overview</a>
  `;
}

// ─── Boot ──────────────────────────────────────────────────────────────────
Promise.all([
  fetchJsonWithError(`/api/my_sets/${setId}`,         'Failed to load task set'),
  fetchJsonWithError(`/api/my_sets/${setId}/heatmap`, 'Failed to load heatmap data'),
])
  .then(([taskSet, heatmap]) => {
    const { tasks, students } = heatmap;
    _taskSet = taskSet;

    renderHeader(taskSet);
    renderControls(tasks, students, () => renderTable(tasks, students));
    renderLegend();
    renderTable(tasks, students);

    document.getElementById('heatmap-main').style.display = '';
  })
  .catch(err => {
    console.error('Heatmap load error:', err);
    if (err.message.includes('401')) {
      window.location.href = '/';
    } else {
      showError(err.message);
    }
  });

import { initSignedInAs, initProtectedPage, initBurgerMenu } from '/js/auth-ui.js';
initSignedInAs();
initProtectedPage('/');
initBurgerMenu();

const params = new URLSearchParams(window.location.search);
const taskId = params.get('id');
const task_setCode = params.get('task_set');
const setId = params.get('set_id');

const backBtn = document.getElementById('back-btn');
if (backBtn) {
	if (setId) {
		backBtn.href = `/task-set-overview?set_id=${encodeURIComponent(setId)}`;
	} else {
		backBtn.href = '/teacher-dashboard';
	}
}

if (!task_setCode) {
	const sidebar = document.querySelector('.student-sidebar');
	if (sidebar) sidebar.style.display = 'none';
	const layout = document.querySelector('.page-layout');
	if (layout) layout.style.gridTemplateColumns = '1fr';
}

if (task_setCode) {
	const codeEl = document.getElementById('taskset-code-label');
	if (codeEl) codeEl.textContent = task_setCode;
}

const CIRC = 376.99; // circumference of r=60 circle

function formatTime(seconds) {
	if (seconds === null || seconds === undefined) return '—';
	if (!Number.isFinite(seconds)) return '—';
	if (seconds < 0) return '—';
	if (seconds === 0) return '0s';
	const mins = Math.floor(seconds / 60);
	const secs = Math.round(seconds % 60);
	return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function escapeHtml(text) {
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}

function showLoadError(message) {
	document.getElementById('exercise-name').textContent = 'Error loading data';
	document.getElementById('input-logs').innerHTML = `<em>${escapeHtml(message || 'Could not load data.')}</em>`;
}


function updateDonut(completed, attempted, notStarted) {
	const notYetCompleted = attempted - completed;
	const total = attempted + notStarted;
	const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
	const completedLen = total > 0 ? (completed / total) * CIRC : 0;
	const notYetCompletedLen = total > 0 ? (notYetCompleted / total) * CIRC : 0;
	const completedDeg = total > 0 ? (completed / total) * 360 - 90 : -90;

	const arcCompleted = document.getElementById('donut-arc-completed');
	const arcNotYetCompleted = document.getElementById('donut-arc-struggling');
	if (arcCompleted) arcCompleted.setAttribute('stroke-dasharray', `${completedLen.toFixed(1)} ${(CIRC - completedLen).toFixed(1)}`);
	if (arcNotYetCompleted) {
		arcNotYetCompleted.setAttribute('stroke-dasharray', `${notYetCompletedLen.toFixed(1)} ${(CIRC - notYetCompletedLen).toFixed(1)}`);
		arcNotYetCompleted.setAttribute('transform', `rotate(${completedDeg} 80 80)`);
	}

	const pctText = document.getElementById('donut-percent-text');
	if (pctText) pctText.textContent = attempted > 0 ? `${pct}%` : '—';

	const elCompleted = document.getElementById('legend-completed');
	const elNotYetCompleted = document.getElementById('legend-struggling');
	const elNotStarted = document.getElementById('legend-not-started');
	if (elCompleted) elCompleted.textContent = completed;
	if (elNotYetCompleted) elNotYetCompleted.textContent = notYetCompleted;
	if (elNotStarted) elNotStarted.textContent = notStarted > 0 ? notStarted : '—';
}

function renderSidebarSection(listEl, moreEl, names, metaFn, max = 6) {
	if (!names.length) {
		listEl.innerHTML = '';
		return;
	}
	const show = names.slice(0, max);
	const extra = names.length - show.length;
	listEl.innerHTML = show.map(n => `
		<div class="sidebar-row">
			<span class="sidebar-row-name">${escapeHtml(n.name)}</span>
			<span class="sidebar-row-meta">${escapeHtml(n.meta)}</span>
		</div>`).join('');
	if (extra > 0 && moreEl) {
		moreEl.textContent = `+ ${extra} more`;
		moreEl.style.display = '';
	} else if (moreEl) {
		moreEl.style.display = 'none';
	}
}

function updateSidebar(completed, notYetCompleted, notStarted, total, students) {
	document.getElementById('sidebar-enrolled-count').textContent = total > 0 ? total : '—';

	const completedNames      = students?.completed       ?? [];
	const notYetCompletedNames = students?.not_yet_completed ?? [];
	const notStartedNames     = students?.not_started     ?? [];

	document.getElementById('sidebar-completed-count').textContent  = completed;
	document.getElementById('sidebar-struggling-count').textContent = notYetCompleted;
	document.getElementById('sidebar-not-started-count').textContent = notStarted;

	renderSidebarSection(
		document.getElementById('sidebar-completed-list'),
		document.getElementById('sidebar-completed-more'),
		completedNames
	);
	renderSidebarSection(
		document.getElementById('sidebar-struggling-list'),
		document.getElementById('sidebar-struggling-more'),
		notYetCompletedNames
	);

	const notStartedList = document.getElementById('sidebar-not-started-list');
	if (notStarted === 0) {
		notStartedList.innerHTML = '<div class="sidebar-empty">All students have attempted this exercise.</div>';
	} else {
		renderSidebarSection(notStartedList, null, notStartedNames);
	}
}

async function loadStatistics() {
	if (!taskId) {
		document.getElementById('exercise-name').textContent = 'No task ID provided';
		document.getElementById('input-logs').innerHTML = '';
		return;
	}

	let apiUrl = `/api/tasks/${taskId}/statistics`;
	if (task_setCode) apiUrl += `?task_set_code=${encodeURIComponent(task_setCode)}`;

	let response;
	try {
		response = await fetch(apiUrl, { credentials: 'include' });
	} catch (error) {
		console.error('Error loading statistics:', error);
		showLoadError('Could not reach the statistics endpoint.');
		return;
	}

	if (!response.ok) {
		if (response.status === 401) {
			window.location.href = '/';
			return;
		}

		let errorMessage = 'Could not load statistics.';
		try {
			const errorBody = await response.json();
			if (errorBody?.detail) errorMessage = errorBody.detail;
		} catch (e) { /* ignore */ }

		console.error('Error loading statistics:', response.status, errorMessage);
		showLoadError(errorMessage);
		return;
	}

	let data;
	try {
		data = await response.json();
	} catch (error) {
		console.error('Error parsing statistics response:', error);
		showLoadError('Statistics response was invalid.');
		return;
	}

	// Header
	const taskName = data.task_name || '—';
	document.getElementById('exercise-name').textContent = taskName;
	const tasksetNameEl = document.getElementById('taskset-name-label');
	if (tasksetNameEl && data.task_set_name) tasksetNameEl.textContent = data.task_set_name;

	// KPI strip
	const totalAttempts = data.total_completions ?? 0;
	const studentsCompleted = data.students_completed ?? 0;
	const studentsAttempted = data.students_attempted ?? 0;
	const studentsNotStarted = data.students_not_started ?? 0;
	const studentsNotYetCompleted = studentsAttempted - studentsCompleted;
	const totalInSet = studentsAttempted + studentsNotStarted;
	const completionRate = studentsAttempted > 0
		? ((studentsCompleted / studentsAttempted) * 100).toFixed(1)
		: '0';

	document.getElementById('total-completions').textContent = totalAttempts;
	document.getElementById('students-completed-num').textContent = studentsCompleted;
	document.getElementById('students-attempted-denom').textContent = ` / ${studentsAttempted}`;
	document.getElementById('completion-rate-sub').textContent = `${completionRate}% completion rate`;
	document.getElementById('students-struggling').textContent = studentsNotYetCompleted;
	document.getElementById('kpi-not-started-num').textContent = studentsNotStarted;
	if (totalInSet > 0) {
		document.getElementById('kpi-not-started-denom').textContent = ` / ${totalInSet}`;
	}

	// Sidebar
	updateSidebar(studentsCompleted, studentsNotYetCompleted, studentsNotStarted, totalInSet, data.students);

	// Donut
	updateDonut(studentsCompleted, studentsAttempted, studentsNotStarted);
	const avgTriesDonut = document.getElementById('avg-tries-donut');
	if (avgTriesDonut) avgTriesDonut.textContent = data.avg_tries != null ? `${data.avg_tries}×` : '—';
	const minTries = data.min_tries ?? null;
	const maxTries = data.max_tries ?? null;
	const minTriesEl = document.getElementById('avg-tries-min');
	const maxTriesEl = document.getElementById('avg-tries-max');
	if (minTriesEl) minTriesEl.textContent = minTries != null ? `${minTries}×` : '—';
	if (maxTriesEl) maxTriesEl.textContent = maxTries != null ? `${maxTries}×` : '—';
	if (minTries != null && maxTries != null && maxTries > minTries) {
		const barWrap = document.getElementById('avg-tries-bar-wrap');
		const fill = document.getElementById('avg-tries-bar-fill');
		const marker = document.getElementById('avg-tries-bar-marker');
		if (barWrap && fill && marker) {
			barWrap.style.display = '';
			const range = maxTries - minTries;
			const avgPct = ((data.avg_tries - minTries) / range) * 100;
			fill.style.width = `${avgPct}%`;
			marker.style.left = `${avgPct}%`;
		}
	}

	// Model answer
	if (data.model_answer) {
		document.getElementById('model-answer-content').innerHTML =
			`<pre class="model-code">${escapeHtml(data.model_answer)}</pre>`;
	}

	// Time metrics
	const tff = data.time_to_first_fail;
	const tfs = data.time_to_first_success;
	const think = data.thinking_time;

	if (tff) {
		document.getElementById('tff-avg').textContent = formatTime(tff.avg);
		document.getElementById('tff-min').textContent = formatTime(tff.min);
		document.getElementById('tff-max').textContent = formatTime(tff.max);
		document.getElementById('tff-metric').style.opacity = '';
	}

	if (tfs) {
		document.getElementById('tfs-avg').textContent = formatTime(tfs.avg);
		document.getElementById('tfs-min').textContent = formatTime(tfs.min);
		document.getElementById('tfs-max').textContent = formatTime(tfs.max);
		document.getElementById('tfs-metric').style.opacity = '';
	}

	if (think) {
		document.getElementById('think-avg').textContent = formatTime(think.avg);
		document.getElementById('think-min').textContent = formatTime(think.min);
		document.getElementById('think-max').textContent = formatTime(think.max);
		document.getElementById('thinking-time-metric').style.opacity = '';
	}

	if (data.number_of_moves) {
		const moves = data.number_of_moves;
		document.getElementById('moves-avg').textContent = moves.avg;
		document.getElementById('moves-min').textContent = moves.min;
		document.getElementById('moves-max').textContent = moves.max;
		document.getElementById('moves-metric').style.opacity = '';
	}

	// Common mistakes
	const logsDiv = document.getElementById('input-logs');
	if (data.common_mistakes?.length > 0) {
		const total = data.common_mistakes.reduce((sum, m) => sum + m.count, 0);
		const totalChip = document.getElementById('mistakes-total-chip');
		if (totalChip) totalChip.textContent = `${total} failed submission${total !== 1 ? 's' : ''} total`;

		const maxCount = data.common_mistakes[0].count;
		let html = '';
		data.common_mistakes.forEach((m, i) => {
			const pct = Math.round((m.count / maxCount) * 100);
			const rankLabel = i === 0 ? 'Most frequent' : '';
			html += `
			<div class="mistake-item">
				<div class="mistake-rank-row">
					<span class="mistake-rank"><span class="rank-num">${i + 1}</span>${rankLabel}</span>
					<span class="mistake-count-chip">${m.count} time${m.count !== 1 ? 's' : ''}</span>
				</div>
				<div class="mistake-freq-bar"><div class="mistake-freq-fill" style="width:${pct}%"></div></div>
				<pre class="mistake-code">${escapeHtml(m.code)}</pre>
			</div>`;
		});
		logsDiv.innerHTML = html;
	} else {
		logsDiv.innerHTML = '<em style="font-size:.85rem;">No failed attempts recorded yet.</em>';
	}
}

loadStatistics();

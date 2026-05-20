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
	if (!task_setCode) {
		backBtn.href = '/global-statistics';
		backBtn.textContent = 'Back to Global Statistics';
	} else if (setId) {
		backBtn.href = `/task-set-overview?set_id=${encodeURIComponent(setId)}`;
		backBtn.innerHTML = '<i class="fas fa-arrow-left"></i> Task Set';
	} else {
		backBtn.href = '/teacher-dashboard';
		backBtn.innerHTML = '<i class="fas fa-arrow-left"></i> Task Set';
	}
}

if (!task_setCode) {
	const sidebar = document.querySelector('.student-sidebar');
	if (sidebar) sidebar.style.display = 'none';
	const layout = document.querySelector('.page-layout');
	if (layout) layout.style.gridTemplateColumns = '1fr';
	const tasksetChip = document.getElementById('taskset-chip');
	if (tasksetChip) tasksetChip.style.display = 'none';
	const globalChip = document.getElementById('global-chip');
	if (globalChip) globalChip.style.display = '';
} else {
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

function formatCount(n) { return String(Math.round(n)); }

function fmtTick(v, fmtFn) {
	if (fmtFn !== formatTime) return fmtFn(v);
	if (v === 0) return '0';
	if (v < 60) return `${v}s`;
	const m = Math.floor(v / 60), s = Math.round(v % 60);
	return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

function niceAxisTicks(maxVal) {
	if (maxVal <= 0) return [0];
	const STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600];
	const step = STEPS.find(s => s >= maxVal / 8) || STEPS[STEPS.length - 1];
	const roundedMax = Math.ceil(maxVal / step) * step;
	const ticks = [];
	for (let v = 0; v <= roundedMax + 0.001; v += step) ticks.push(v);
	return ticks;
}

function renderBoxPlot(containerId, stats, desc) {
	const container = document.getElementById(containerId);
	if (!container) return;

	const fmt = desc.fmt || formatTime;

	if (!stats || !stats.count) {
		container.innerHTML = `<div class="bp-metric" style="opacity:.45">
			<div class="bp-header">
				<div class="bp-name"><span class="bp-dot" style="background:${desc.color}"></span>${desc.name}</div>
				<span style="font-size:.7rem;color:var(--text-muted);font-style:italic;">Not yet tracked</span>
			</div>
		</div>`;
		return;
	}

	if (stats.count < 5) {
		container.innerHTML = `<div class="bp-metric">
			<div class="bp-header">
				<div class="bp-name">
					<span class="bp-dot" style="background:${desc.color}"></span>
					${desc.name}
					<span style="font-size:.65rem;color:var(--text-muted);font-weight:400;margin-left:.4rem;">n = ${stats.count}</span>
				</div>
				<span style="font-size:.72rem;color:var(--text-muted);font-style:italic;">Not enough data for a box plot</span>
			</div>
			<div style="display:flex;gap:2rem;padding:.5rem 0;font-size:.8rem;color:var(--text-muted);">
				<span>min <b style="color:var(--text);font-weight:700;">${fmt(stats.min)}</b></span>
				<span>median <b style="color:${desc.color};font-weight:700;">${fmt(stats.median)}</b></span>
				<span>avg <b style="color:var(--text);font-weight:700;">${fmt(stats.avg)}</b></span>
				<span>max <b style="color:var(--text);font-weight:700;">${fmt(stats.max)}</b></span>
			</div>
		</div>`;
		return;
	}

	const W = 1000;
	const outliers = stats.outliers || [];
	const whiskerLow = stats.whisker_low;
	const whiskerHigh = stats.whisker_high;
	const maxOutlier = outliers.length > 0 ? Math.max(...outliers) : 0;
	const dataMax = Math.max(whiskerHigh, maxOutlier, stats.max);

	// Break the axis when outliers are far from the fence (> 2× whiskerHigh)
	const W_MAIN = 780, W_BREAK = 44, W_OUT = W - 780 - 44; // 176
	const useAxisBreak = outliers.length > 0 && whiskerHigh > 0 && maxOutlier > 2 * whiskerHigh;
	let xp, ticks, breakX1 = -1, breakX2 = -1, cutoff = 0;

	if (useAxisBreak) {
		const mainTicks = niceAxisTicks(whiskerHigh);
		cutoff = mainTicks[mainTicks.length - 1];
		const outTotal = (maxOutlier - cutoff) * 1.1; // 10 % right padding
		xp = v => v <= cutoff
			? (v / cutoff) * W_MAIN
			: W_MAIN + W_BREAK + Math.min(((v - cutoff) / outTotal) * W_OUT, W_OUT);
		ticks = mainTicks;
		breakX1 = W_MAIN;
		breakX2 = W_MAIN + W_BREAK;
	} else {
		ticks = niceAxisTicks(dataMax);
		const scaleMax = ticks[ticks.length - 1] * 1.001 || 1;
		xp = v => (v / scaleMax) * W;
	}

	// Y layout: top labels → box plot → axis → tick labels
	const Y_VAL  = 14;            // bold value text
	const Y_NAME = 26;            // smaller label name
	const CY     = 53;            // box centre
	const BH     = 20;
	const BT     = CY - BH / 2;  // 43
	const BB     = CY + BH / 2;  // 63
	const AY     = 80;            // axis line
	const Y_TICK = 100;           // tick number labels

	const xWL = xp(whiskerLow), xWH = xp(whiskerHigh);
	const xQ1 = xp(stats.q1), xQ3 = xp(stats.q3);
	const xMed = xp(stats.median), xAvg = xp(stats.avg);
	const iqrWidth = Math.max(xQ3 - xQ1, 2);

	// ── top labels (value + name), priority-deduped ──────────────
	const rawLabels = [
		{ x: xMed, val: fmt(stats.median),  name: 'Median',   pri: 6 },
		{ x: xQ3,  val: fmt(stats.q3),       name: 'Q3',       pri: 5 },
		{ x: xQ1,  val: fmt(stats.q1),       name: 'Q1',       pri: 5 },
		{ x: xWH,  val: fmt(whiskerHigh),    name: outliers.length ? 'Fence' : 'Maximum', pri: 4 },
		{ x: xWL,  val: fmt(stats.min),      name: 'Minimum',  pri: 3 },
		...outliers.map(v => ({ x: xp(v), val: fmt(v), name: 'Outlier', pri: 2 })),
	];
	const MIN_LABEL_GAP = 80;
	const shownLabels = [];
	for (const lp of rawLabels) {
		if (!shownLabels.some(sl => Math.abs(sl.x - lp.x) < MIN_LABEL_GAP)) shownLabels.push(lp);
	}

	const p = [];

	for (const lp of shownLabels) {
		const a = lp.x < 30 ? 'start' : lp.x > W - 30 ? 'end' : 'middle';
		p.push(`<text x="${lp.x.toFixed(1)}" y="${Y_VAL}" text-anchor="${a}" font-family="DM Sans,sans-serif" font-size="14" font-weight="800" fill="${desc.colorDark}">${lp.val}</text>`);
		p.push(`<text x="${lp.x.toFixed(1)}" y="${Y_NAME}" text-anchor="${a}" font-family="DM Sans,sans-serif" font-size="9.5" fill="#94a3b8">${lp.name}</text>`);
	}

	// ── box plot ─────────────────────────────────────────────────
	// whisker spine
	p.push(`<line x1="${xWL}" y1="${CY}" x2="${xWH}" y2="${CY}" stroke="${desc.color}" stroke-width="1.5"/>`);
	// whisker caps
	p.push(`<line x1="${xWL}" y1="${BT + 2}" x2="${xWL}" y2="${BB - 2}" stroke="${desc.color}" stroke-width="1.5"/>`);
	p.push(`<line x1="${xWH}" y1="${BT + 2}" x2="${xWH}" y2="${BB - 2}" stroke="${desc.color}" stroke-width="1.5"/>`);
	// IQR box
	p.push(`<rect x="${xQ1}" y="${BT}" width="${iqrWidth}" height="${BH}" fill="${desc.colorLight}" stroke="${desc.color}" stroke-width="1.5" rx="2"/>`);
	// median line
	p.push(`<line x1="${xMed}" y1="${BT}" x2="${xMed}" y2="${BB}" stroke="${desc.colorDark}" stroke-width="2.5"/>`);
	// mean diamond
	p.push(`<path d="M ${xAvg} ${BT + 3} L ${xAvg + 5} ${CY} L ${xAvg} ${BB - 3} L ${xAvg - 5} ${CY} Z" fill="${desc.color}" stroke="white" stroke-width="1"/>`);
	// outlier dots
	for (const v of outliers) {
		p.push(`<circle cx="${xp(v).toFixed(1)}" cy="${CY}" r="3.5" fill="${desc.color}" stroke="white" stroke-width="1.5"/>`);
	}

	// ── axis + ticks ─────────────────────────────────────────────
	if (useAxisBreak) {
		p.push(`<line x1="0" y1="${AY}" x2="${breakX1}" y2="${AY}" stroke="#cbd5e1" stroke-width="1.5"/>`);
		p.push(`<line x1="${breakX2}" y1="${AY}" x2="${W}" y2="${AY}" stroke="#cbd5e1" stroke-width="1.5"/>`);
		// Break indicator: two diagonal slashes
		const bxMid = (breakX1 + breakX2) / 2;
		const SO = 8;
		p.push(`<line x1="${bxMid - SO - 4}" y1="${AY - 6}" x2="${bxMid - SO + 4}" y2="${AY + 6}" stroke="#94a3b8" stroke-width="1.5"/>`);
		p.push(`<line x1="${bxMid + SO - 4}" y1="${AY - 6}" x2="${bxMid + SO + 4}" y2="${AY + 6}" stroke="#94a3b8" stroke-width="1.5"/>`);
		p.push(`<text x="${bxMid}" y="${Y_TICK}" text-anchor="middle" font-family="DM Sans,sans-serif" font-size="10" fill="#94a3b8">…</text>`);
	} else {
		p.push(`<line x1="0" y1="${AY}" x2="${W}" y2="${AY}" stroke="#cbd5e1" stroke-width="1.5"/>`);
	}
	for (const tv of ticks) {
		const tx = xp(tv);
		if (tx < 0 || tx > W + 1) continue;
		const a = tx < 15 ? 'start' : tx > W - 15 ? 'end' : 'middle';
		p.push(`<line x1="${tx.toFixed(1)}" y1="${AY}" x2="${tx.toFixed(1)}" y2="${AY + 7}" stroke="#cbd5e1" stroke-width="1"/>`);
		p.push(`<text x="${tx.toFixed(1)}" y="${Y_TICK}" text-anchor="${a}" font-family="DM Sans,sans-serif" font-size="10" fill="#94a3b8">${fmtTick(tv, fmt)}</text>`);
	}
	if (useAxisBreak) {
		// Tick marks at each unique outlier value in the outlier section
		for (const v of [...new Set(outliers)]) {
			const tx = xp(v);
			const a = tx > W - 15 ? 'end' : 'middle';
			p.push(`<line x1="${tx.toFixed(1)}" y1="${AY}" x2="${tx.toFixed(1)}" y2="${AY + 7}" stroke="#cbd5e1" stroke-width="1"/>`);
			p.push(`<text x="${tx.toFixed(1)}" y="${Y_TICK}" text-anchor="${a}" font-family="DM Sans,sans-serif" font-size="10" fill="#94a3b8">${fmtTick(v, fmt)}</text>`);
		}
	}

	const legendSvg = (w, h, body) =>
		`<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="flex-shrink:0;overflow:visible;">${body}</svg>`;

	container.innerHTML = `
		<div class="bp-metric">
			<div class="bp-header">
				<div class="bp-name">
					<span class="bp-dot" style="background:${desc.color}"></span>
					${desc.name}
					<span style="font-size:.65rem;color:var(--text-muted);font-weight:400;margin-left:.4rem;">n = ${stats.count}</span>
				</div>
				<div class="bp-summary">
					<span><span class="bp-summary-label">median</span> <b style="color:${desc.color}">${fmt(stats.median)}</b></span>
					<span><span class="bp-summary-label">avg</span> <b>${fmt(stats.avg)}</b></span>
				</div>
			</div>
			<div class="bp-svg-wrap">
				<svg viewBox="0 0 ${W} 108" style="width:100%;height:auto;display:block;overflow:visible;">
					${p.join('')}
				</svg>
			</div>
			<div class="bp-legend">
				<span class="bp-legend-item">
					${legendSvg(14, 12, `<rect x="1" y="1" width="12" height="10" rx="2" fill="${desc.colorLight}" stroke="${desc.color}" stroke-width="1.5"/>`)}
					Q1–Q3 box (middle 50%)
				</span>
				<span class="bp-legend-item">
					${legendSvg(10, 12, `<line x1="5" y1="1" x2="5" y2="11" stroke="${desc.colorDark}" stroke-width="2.5"/>`)}
					Median
				</span>
				<span class="bp-legend-item">
					${legendSvg(12, 12, `<path d="M6 1 L11 6 L6 11 L1 6 Z" fill="${desc.color}"/>`)}
					Mean
				</span>
				<span class="bp-legend-item">
					${legendSvg(26, 12, `<line x1="0" y1="6" x2="26" y2="6" stroke="${desc.color}" stroke-width="1.5"/><line x1="0" y1="3" x2="0" y2="9" stroke="${desc.color}" stroke-width="1.5"/><line x1="26" y1="3" x2="26" y2="9" stroke="${desc.color}" stroke-width="1.5"/>`)}
					Whiskers (1.5×IQR from Q1/Q3)
				</span>
				<span class="bp-legend-item">
					${legendSvg(12, 12, `<circle cx="6" cy="6" r="3.5" fill="${desc.color}" stroke="white" stroke-width="1.5"/>`)}
					Outlier (beyond whiskers)
				</span>
			</div>
		</div>`;
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
	const hasNotYetCompleted = notYetCompleted > 0;
	const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
	const completedLen = total > 0 ? (completed / total) * CIRC : 0;
	const notYetCompletedLen = total > 0 ? (notYetCompleted / total) * CIRC : 0;
	const completedDeg = total > 0 ? (completed / total) * 360 - 90 : -90;

	const arcCompleted = document.getElementById('donut-arc-completed');
	const arcNotYetCompleted = document.getElementById('donut-arc-struggling');
	if (arcCompleted) {
		arcCompleted.setAttribute('stroke', '#16a34a');
		arcCompleted.setAttribute('stroke-dasharray', `${completedLen.toFixed(1)} ${(CIRC - completedLen).toFixed(1)}`);
	}
	if (arcNotYetCompleted) {
		arcNotYetCompleted.setAttribute('stroke', hasNotYetCompleted ? '#fca5a5' : 'transparent');
		arcNotYetCompleted.setAttribute('stroke-dasharray', `${notYetCompletedLen.toFixed(1)} ${(CIRC - notYetCompletedLen).toFixed(1)}`);
		arcNotYetCompleted.setAttribute('transform', `rotate(${completedDeg} 80 80)`);
	}

	const pctText = document.getElementById('donut-percent-text');
	if (pctText) pctText.textContent = attempted > 0 ? `${pct}%` : '—';

	const elCompleted = document.getElementById('legend-completed');
	const elNotYetCompleted = document.getElementById('legend-struggling');
	const elNotStarted = document.getElementById('legend-not-started');
	const dotCompleted = document.getElementById('legend-dot-completed');
	const dotNotYetCompleted = document.getElementById('legend-dot-struggling');
	if (dotCompleted) dotCompleted.style.background = '#16a34a';
	if (dotNotYetCompleted) dotNotYetCompleted.style.background = hasNotYetCompleted ? '#fca5a5' : '#cbd5e1';
	if (elCompleted) elCompleted.textContent = completed;
	if (elCompleted) elCompleted.style.color = 'var(--green)';
	if (elNotYetCompleted) {
		elNotYetCompleted.textContent = notYetCompleted;
		elNotYetCompleted.style.color = hasNotYetCompleted ? 'var(--red)' : 'var(--text-muted)';
	}
	if (elNotStarted) elNotStarted.textContent = notStarted > 0 ? notStarted : '—';
}

function renderSidebarSection(listEl, moreEl, names, urlFn, max = 6) {
	if (!names.length) {
		listEl.innerHTML = '';
		return;
	}
	const show = names.slice(0, max);
	const extra = names.length - show.length;
	listEl.innerHTML = show.map(n => {
		const url = urlFn ? urlFn(n.name) : null;
		const tag = url ? 'a' : 'div';
		const href = url ? ` href="${url}"` : '';
		return `
		<${tag} class="sidebar-row"${href}>
			<span class="sidebar-row-name">${escapeHtml(n.name)}</span>
			<span class="sidebar-row-meta">${escapeHtml(n.meta)}</span>
		</${tag}>`;
	}).join('');
	if (extra > 0 && moreEl) {
		moreEl.textContent = `+ ${extra} more`;
		moreEl.style.display = '';
	} else if (moreEl) {
		moreEl.style.display = 'none';
	}
}

function updateSidebar(completed, notYetCompleted, notStarted, total, students) {
	document.getElementById('sidebar-enrolled-count').textContent = total > 0 ? total : '—';

	const completedNames       = students?.completed        ?? [];
	const notYetCompletedNames = students?.not_yet_completed ?? [];
	const notStartedNames      = students?.not_started      ?? [];

	document.getElementById('sidebar-completed-count').textContent   = completed;
	document.getElementById('sidebar-struggling-count').textContent  = notYetCompleted;
	document.getElementById('sidebar-not-started-count').textContent = notStarted;

	const taskStatsUrl = (taskId && setId)
		? name => `/student-task-statistics?student=${encodeURIComponent(name)}&task_id=${encodeURIComponent(taskId)}&set_id=${encodeURIComponent(setId)}`
		: null;
	const attemptsUrl = setId
		? name => `/student-attempts?student=${encodeURIComponent(name)}&set_id=${encodeURIComponent(setId)}`
		: null;

	renderSidebarSection(
		document.getElementById('sidebar-completed-list'),
		document.getElementById('sidebar-completed-more'),
		completedNames,
		taskStatsUrl
	);
	renderSidebarSection(
		document.getElementById('sidebar-struggling-list'),
		document.getElementById('sidebar-struggling-more'),
		notYetCompletedNames,
		taskStatsUrl
	);

	const notStartedList = document.getElementById('sidebar-not-started-list');
	if (notStarted === 0) {
		notStartedList.innerHTML = '<div class="sidebar-empty">All students have attempted this exercise.</div>';
	} else {
		renderSidebarSection(notStartedList, null, notStartedNames, attemptsUrl);
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
		document.getElementById('tff-metric').style.opacity = '';
		renderBoxPlot('bp-tff', tff, { name: 'Time to First Fail', color: '#dc2626', colorLight: '#fee2e2', colorDark: '#7f1d1d', fmt: formatTime });
	}
	if (tfs) {
		document.getElementById('tfs-metric').style.opacity = '';
		renderBoxPlot('bp-tfs', tfs, { name: 'Time to First Success', color: '#16a34a', colorLight: '#dcfce7', colorDark: '#14532d', fmt: formatTime });
	}
	if (think) {
		document.getElementById('thinking-time-metric').style.opacity = '';
		renderBoxPlot('bp-think', think, { name: 'Thinking Time', color: '#7b8df0', colorLight: '#e0e7ff', colorDark: '#3730a3', fmt: formatTime });
	}
	if (data.number_of_moves) {
		document.getElementById('moves-metric').style.opacity = '';
		renderBoxPlot('bp-moves', data.number_of_moves, { name: 'Number of Moves', color: '#94a3b8', colorLight: '#e2e8f0', colorDark: '#334155', fmt: formatCount });
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

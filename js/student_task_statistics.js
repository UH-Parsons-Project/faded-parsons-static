import {initProtectedPage, initSignedInAs, initBurgerMenu} from '/js/auth-ui.js';

initProtectedPage('/');
initSignedInAs();
initBurgerMenu();

const params = new URLSearchParams(window.location.search);
const studentUsername = params.get('student');
const taskId = params.get('task_id');
const setId = params.get('set_id');

if (!studentUsername || !taskId || !setId) {
	window.location.href = '/teacher-dashboard';
}

document.getElementById('back-btn').href = `/student_attempts?student=${encodeURIComponent(studentUsername)}&set_id=${setId}`;

function formatTime(seconds) {
	if (!seconds) return '0s';
	const mins = Math.floor(seconds / 60);
	const secs = Math.round(seconds % 60);
	return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function formatDateTime(isoString) {
	if (!isoString) return 'N/A';
	const date = new Date(isoString);
	return date.toLocaleString('en-US', {
		year: 'numeric', month: 'short', day: 'numeric',
		hour: '2-digit', minute: '2-digit', second: '2-digit'
	});
}

function escapeHtml(text) {
	if (!text) return '';
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}

function setupCollapsible(toggleId, bodyId, chevronId) {
	const toggle  = document.getElementById(toggleId);
	const body    = document.getElementById(bodyId);
	const chevron = document.getElementById(chevronId);
	if (!toggle || !body) return;
	toggle.addEventListener('click', () => {
		const open = !body.classList.contains('collapsed');
		body.classList.toggle('collapsed', open);
		if (chevron) chevron.classList.toggle('open', !open);
	});
}

function renderHeader(data) {
	document.getElementById('page-header').style.display = 'none';
	document.getElementById('content-header').style.display = 'flex';
	document.getElementById('exercise-name').textContent = data.task_name || '—';
	document.getElementById('student-name-text').textContent = data.student_username || studentUsername;
	if (data.task_set_name) document.getElementById('taskset-name-label').textContent = data.task_set_name;
}

function renderTaskInstructions(taskInstructions) {
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
	if (parsedInstructions.function_name) html += `<strong>${escapeHtml(parsedInstructions.function_name)}</strong>`;
	if (parsedInstructions.task_instructions) html += ` ${escapeHtml(parsedInstructions.task_instructions)}`;
	if (parsedInstructions.examples) html += `<br><pre><code>${escapeHtml(parsedInstructions.examples)}</code></pre>`;

	content.innerHTML = html;
	box.style.display = 'block';
}

function renderModelAnswer(modelAnswer) {
	const content = document.getElementById('model-answer-content');
	if (modelAnswer && modelAnswer.trim()) {
		content.innerHTML = `<pre class="model-code">${escapeHtml(modelAnswer)}</pre>`;
	}
}

function createAttemptItem(attempt) {
	const item = document.createElement('div');
	item.className = `attempt-item ${attempt.success ? 'success' : 'failure'}`;

	const timePart = attempt.time_taken !== null
		? ` &nbsp;·&nbsp; ${formatTime(attempt.time_taken)}`
		: '';

	item.innerHTML = `
		<div class="attempt-head">
			<span class="attempt-num">Attempt #${attempt.attempt_number}</span>
			<div class="attempt-meta-row">
				<span class="attempt-time"><i class="fas fa-clock mr-1"></i>${formatDateTime(attempt.completed_at)}${timePart}</span>
				<span class="attempt-badge ${attempt.success ? 'success' : 'failure'}">${attempt.success ? 'Success' : 'Failed'}</span>
			</div>
		</div>
		${attempt.code ? `<div class="attempt-code-wrap"><pre class="attempt-code">${escapeHtml(attempt.code)}</pre></div>` : ''}
	`;

	return item;
}

function renderAttempts(attempts) {
	const list = document.getElementById('attempts-list');
	const count = document.getElementById('attempts-count');
	count.textContent = attempts.length;

	if (attempts.length === 0) {
		list.innerHTML = '<em class="text-muted" style="font-size:.85rem;">No attempts recorded yet.</em>';
		return;
	}

	list.innerHTML = '';
	attempts.forEach(attempt => list.appendChild(createAttemptItem(attempt)));
}

const EXIT_REASON_LABELS = {
	inactivity_timeout: 'Inactivity timeout',
	manual_navigation:  'Navigated away',
	page_close:         'Closed tab/window',
};

function renderSessions(sessions) {
	const list = document.getElementById('sessions-list');
	const count = document.getElementById('sessions-count');
	count.textContent = sessions.length;

	if (sessions.length === 0) {
		list.innerHTML = '<em class="text-muted" style="font-size:.85rem;">No sessions recorded.</em>';
		return;
	}

	list.innerHTML = '';
	sessions.forEach((s, i) => {
		const div = document.createElement('div');
		div.className = 'session-item';
		const duration = s.duration_seconds != null ? formatTime(s.duration_seconds) : '—';
		const exitLabel = EXIT_REASON_LABELS[s.exit_reason] ?? (s.exit_reason || 'No exit recorded');
		div.innerHTML = `
			<div class="session-info">
				<div class="session-num">Session #${i + 1}</div>
				<div class="session-detail">
					Entered: ${formatDateTime(s.entered_at)}<br>
					${s.exited_at ? `Exited: ${formatDateTime(s.exited_at)}<br>` : '<em>Still active</em><br>'}
					Duration: ${duration}
				</div>
			</div>
			<span class="session-exit">${escapeHtml(exitLabel)}</span>
		`;
		list.appendChild(div);
	});
}

function renderStatistics(data) {
	document.getElementById('stat-total').textContent   = data.total_attempts;
	document.getElementById('stat-success').textContent = data.successful_attempts;
	document.getElementById('stat-failed').textContent  = data.failed_attempts;

	if (data.empty_attempts && data.empty_attempts > 0) {
		document.getElementById('empty-attempts-item').style.display = 'block';
		document.getElementById('stat-empty').textContent = data.empty_attempts;
	}

	if (data.total_time_seconds) {
		document.getElementById('kpi-time-to-pass').textContent = formatTime(data.total_time_seconds);
	}

	if (data.time_to_first_success) {
		document.getElementById('time-to-success').textContent =
			formatTime(data.time_to_first_success.seconds);
	}

	if (data.time_to_first_fail) {
		document.getElementById('time-to-fail').textContent =
			formatTime(data.time_to_first_fail.seconds);
	}

	if (data.thinking_time) {
		const el = document.getElementById('thinking-time');
		el.textContent = formatTime(data.thinking_time.seconds);
		el.style.fontSize = '';
		el.style.color = '';
		const sub = document.getElementById('thinking-time-sub');
		if (sub) sub.style.display = 'none';
	}

	if (data.move_count !== null && data.move_count !== undefined) {
		document.getElementById('move-count').textContent = data.move_count;
	}
}

function showError(message) {
	const container = document.getElementById('page-header');
	container.className = '';
	container.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;padding:4rem 2rem;color:#64748b;';
	container.innerHTML = `
		<i class="fas fa-exclamation-triangle text-danger" style="font-size:2rem;margin-bottom:1rem;"></i>
		<h4>Error Loading Data</h4>
		<p>${escapeHtml(message || 'An unexpected error occurred.')}</p>
		<a href="/teacher-dashboard" class="btn btn-primary mt-3">Back to Task Sets</a>
	`;
}

// ── Replay engine ──────────────────────────────────────────────────────────

function countBlanks(code) {
	return (code.match(/___/g) || []).length;
}

function renderBlockCode(code, blanks) {
	let i = 0;
	return escapeHtml(code).replace(/___/g, () => {
		const val = (blanks && blanks[i] !== undefined) ? escapeHtml(blanks[i]) : '';
		i++;
		return `<span class="replay-blank">${val || '&nbsp;&nbsp;'}</span>`;
	}).replace(/!BLANK/g, () => {
		const val = (blanks && blanks[i] !== undefined) ? escapeHtml(blanks[i]) : '';
		i++;
		return `<span class="replay-blank">${val || '&nbsp;&nbsp;'}</span>`;
	});
}

function buildInitialState(initialBlocks) {
	const starter = [];
	const solution = [];

	const nonGiven = initialBlocks.filter(b => !b.given);
	const given = initialBlocks.filter(b => b.given);

	function alphabetizeCompare(a, b) {
		const aCode = a.code;
		const bCode = b.code;
		if (aCode.startsWith('#') || aCode.startsWith('print(') || aCode.startsWith('p !BLANK')) return 1;
		if (bCode.startsWith('#') || bCode.startsWith('print(') || bCode.startsWith('p !BLANK')) return -1;
		if (aCode > bCode) return 1;
		if (aCode < bCode) return -1;
		return 0;
	}
	const sorted = [...nonGiven].sort(alphabetizeCompare);

	for (const b of sorted) {
		starter.push({
			block_id: b.block_id, code: b.code, given: false,
			debug: b.debug || false, indent: b.indent,
			blanks: Array(countBlanks(b.code)).fill(''),
		});
	}
	for (const b of given) {
		solution.push({
			block_id: b.block_id, code: b.code, given: true,
			indent: b.indent, blanks: Array(countBlanks(b.code)).fill(''),
		});
	}

	return { starter, solution };
}

function deepCopyState(state) {
	return {
		starter:  state.starter.map(b => ({ ...b, blanks: [...b.blanks], debug: b.debug || false })),
		solution: state.solution.map(b => ({ ...b, blanks: [...b.blanks], debug: b.debug || false })),
	};
}

function applyEvent(state, event) {
	const next = deepCopyState(state);

	if (event.type === 'move') {
		const src = next[event.from_container];
		const dst = next[event.to_container];
		if (!src || !dst) return next;
		const idx = src.findIndex(b => b.block_id === event.block_id);
		if (idx === -1) return next;
		const [block] = src.splice(idx, 1);
		block.indent = event.to_indent;
		dst.splice(Math.min(event.to_index, dst.length), 0, block);
	} else if (event.type === 'edit') {
		for (const container of [next.starter, next.solution]) {
			const block = container.find(b => b.block_id === event.block_id);
			if (block) {
				if (!block.blanks[event.blank_index] && block.blanks[event.blank_index] !== '') {
					block.blanks[event.blank_index] = '';
				}
				block.blanks[event.blank_index] = event.value;
				break;
			}
		}
	}

	return next;
}

function renderReplayBoard(state, highlightBlockId) {
	const renderColumn = (blocks, containerId, noIndent) => {
		const el = document.getElementById(containerId);
		el.innerHTML = '';
		if (blocks.length === 0) {
			el.innerHTML = '<em class="text-muted" style="font-size:0.8rem;">empty</em>';
			return;
		}
		for (const block of blocks) {
			const div = document.createElement('div');
			div.className = 'replay-block'
				+ (block.block_id === highlightBlockId ? ' highlight' : '')
				+ (block.given ? ' given' : '')
				+ (block.debug ? ' debug' : '');
			div.style.marginLeft = noIndent ? '0' : (block.indent * 20) + 'px';
			div.innerHTML = renderBlockCode(block.code, block.blanks);
			el.appendChild(div);
		}
	};

	renderColumn(state.starter, 'replay-starter-blocks', true);
	renderColumn(state.solution, 'replay-solution-blocks', false);
}

function renderReplayStep(states, events, stepIndex) {
	const total = events.length;
	document.getElementById('replay-step-label').textContent = `Step ${stepIndex} / ${total}`;
	document.getElementById('replay-prev').disabled = stepIndex === 0;
	document.getElementById('replay-next').disabled = stepIndex === total;

	const labelEl = document.getElementById('replay-event-label');
	const board   = document.getElementById('replay-board');

	if (stepIndex === 0) {
		labelEl.textContent = 'Initial state';
		board.classList.remove('replay-run-success-board', 'replay-run-fail-board');
		renderReplayBoard(states[0], null);
		return;
	}

	const event = events[stepIndex - 1];

	if (event.type === 'run') {
		const success = event.success;
		labelEl.innerHTML = success
			? '<span class="replay-run-badge replay-run-success"><i class="fas fa-check mr-1"></i>Ran code — Passed</span>'
			: '<span class="replay-run-badge replay-run-fail"><i class="fas fa-times mr-1"></i>Ran code — Failed</span>';
		board.classList.remove('replay-run-success-board', 'replay-run-fail-board');
		board.classList.add(success ? 'replay-run-success-board' : 'replay-run-fail-board');
		renderReplayBoard(states[stepIndex], null);
		return;
	}

	board.classList.remove('replay-run-success-board', 'replay-run-fail-board');

	const rawCode = (event.block_code || event.block_id).replace(/!BLANK/g, '___');
	const blockLabel = `<span class="replay-block replay-block-inline">${escapeHtml(rawCode)}</span>`;

	if (event.type === 'edit') {
		const blankNum = event.blank_index + 1;
		const val = escapeHtml(event.value);
		labelEl.innerHTML = val
			? `Typed <strong>"${val}"</strong> into blank ${blankNum} of ${blockLabel}`
			: `Cleared blank ${blankNum} of ${blockLabel}`;
	} else {
		const sameContainer = event.from_container === event.to_container;
		const sameIndex = event.from_index === event.to_index;
		const indentLabel = event.to_indent > 0 ? `, indent ${event.to_indent}` : '';
		let msg;
		if (sameContainer && sameIndex) {
			msg = `Indented ${blockLabel} to level ${event.to_indent}`;
		} else if (event.from_container === 'starter') {
			msg = `Moved ${blockLabel} to solution${indentLabel}`;
		} else if (event.to_container === 'starter') {
			msg = `Returned ${blockLabel} to starter`;
		} else {
			msg = `Reordered ${blockLabel} in solution${indentLabel}`;
		}
		labelEl.innerHTML = msg;
	}

	renderReplayBoard(states[stepIndex], event.block_id);
}

async function initReplay(studentUsername, taskId, setId) {
	const loadingEl  = document.getElementById('replay-loading');
	const boardEl    = document.getElementById('replay-board');
	const controlsEl = document.getElementById('replay-controls');
	const labelEl    = document.getElementById('replay-event-label');

	try {
		const response = await fetch(
			`/api/students/${encodeURIComponent(studentUsername)}/tasks/${taskId}/moves?set_id=${setId}`,
			{ credentials: 'include' }
		);

		if (!response.ok) {
			loadingEl.innerHTML = '<em class="text-muted">No replay data available.</em>';
			return;
		}

		const data = await response.json();
		const events = data.events || [];
		const initialBlocks = data.initial_blocks || [];

		loadingEl.style.display = 'none';

		if (events.length === 0 && initialBlocks.length === 0) {
			boardEl.style.display = 'none';
			controlsEl.style.display = 'none';
			labelEl.textContent = '';
			document.getElementById('replay-step-label').textContent = 'No events recorded.';
			return;
		}

		const initialState = buildInitialState(initialBlocks);
		const states = [initialState];
		for (const event of events) {
			states.push(applyEvent(states[states.length - 1], event));
		}

		const slider = document.getElementById('replay-slider');
		slider.max = events.length;
		slider.value = 0;
		slider.disabled = events.length === 0;

		let currentStep = 0;

		const goToStep = (step) => {
			currentStep = step;
			slider.value = step;
			renderReplayStep(states, events, step);
		};
		renderReplayStep(states, events, currentStep);

		document.getElementById('replay-prev').addEventListener('click', () => {
			if (currentStep > 0) goToStep(currentStep - 1);
		});
		document.getElementById('replay-next').addEventListener('click', () => {
			if (currentStep < events.length) goToStep(currentStep + 1);
		});
		slider.addEventListener('input', () => goToStep(parseInt(slider.value, 10)));

		document.getElementById('replay-prev').disabled = false;
		document.getElementById('replay-next').disabled = events.length === 0;

	} catch (err) {
		console.error('Error initialising replay:', err);
		loadingEl.innerHTML = '<em class="text-danger">Error loading replay.</em>';
	}
}

// ── Collapsibles ───────────────────────────────────────────────────────────

setupCollapsible('attempts-toggle', 'attempts-body',  'attempts-chevron');
setupCollapsible('replay-toggle',   'replay-body',    'replay-chevron');
setupCollapsible('sessions-toggle', 'sessions-body',  'sessions-chevron');
setupCollapsible('model-toggle',    'model-body',     'model-chevron');

// ── Load data ──────────────────────────────────────────────────────────────

fetch(`/api/students/${encodeURIComponent(studentUsername)}/tasks/${taskId}/statistics?set_id=${setId}`, {
	credentials: 'include'
})
	.then(r => {
		if (!r.ok) {
			if (r.status === 401) { window.location.href = '/'; return; }
			throw new Error('Failed to load statistics');
		}
		return r.json();
	})
	.then(data => {
		renderHeader(data);
		renderTaskInstructions(data.task_instructions);
		renderModelAnswer(data.model_answer);
		renderAttempts(data.attempts_detail);
		renderSessions(data.sessions || []);
		renderStatistics(data);
		initReplay(studentUsername, taskId, setId);
		document.getElementById('content-container').style.display = 'block';
	})
	.catch(err => {
		console.error('Error loading statistics:', err);
		if (err.message && err.message.includes('401')) {
			window.location.href = '/';
		} else {
			showError(err.message);
		}
	});

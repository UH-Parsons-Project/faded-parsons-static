import {initProtectedPage, initSignedInAs} from '/js/auth-ui.js';

initProtectedPage('/');
initSignedInAs();

const params = new URLSearchParams(window.location.search);
const studentUsername = params.get('student');
const taskId = params.get('task_id');
const setId = params.get('set_id');

if (!studentUsername || !taskId || !setId) {
	window.location.href = '/teacher-dashboard';
}

// Set up back button
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
	year: 'numeric',
	month: 'short',
	day: 'numeric',
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit'
	});
}

function escapeHtml(text) {
	if (!text) return '';
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}

function renderHeader(data) {
	const container = document.getElementById('page-header');
	container.className = 'sts-page-header mb-4';
	container.innerHTML = `
	<h2 class="sts-task-title"><i class="fas fa-code mr-2"></i>${escapeHtml(data.task_name)}</h2>
	<span class="sts-student-badge"><i class="fas fa-user-graduate mr-1"></i>${escapeHtml(data.student_username)}</span>
	`;
}

function renderTaskInstructions(taskInstructions) {
	const box = document.getElementById('task-instructions-box');
	const content = document.getElementById('task-instructions-content');

	if (!taskInstructions || !taskInstructions.trim()) {
	box.style.display = 'none';
	return;
	}

	// Parse JSON description
	let parsedInstructions = {};
	try {
	parsedInstructions = typeof taskInstructions === 'string'
		? JSON.parse(taskInstructions)
		: taskInstructions;
	} catch (e) {
	// If not JSON, display as-is
	content.innerHTML = taskInstructions;
	box.style.display = 'block';
	return;
	}

	// Build HTML from parsed description
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

function renderModelAnswer(modelAnswer) {
	const box = document.getElementById('model-answer-box');
	const content = document.getElementById('model-answer-content');

	if (!modelAnswer || !modelAnswer.trim()) {
	box.style.display = 'none';
	return;
	}

	content.textContent = modelAnswer;
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

// ── Replay engine ──────────────────────────────────────────────────────────

function countBlanks(code) {
	return (code.match(/___/g) || []).length;
}

function renderBlockCode(code, blanks) {
	// Block code stores blanks as ___ (real blocks) or !BLANK (debug lines)
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

	// Mirror alphabetize() — sort non-given blocks by code
	const sorted = [...nonGiven].sort((a, b) => a.code.localeCompare(b.code));

	for (const b of sorted) {
		starter.push({
			block_id: b.block_id,
			code: b.code,
			given: false,
			debug: b.debug || false,
			indent: b.indent,
			blanks: Array(countBlanks(b.code)).fill(''),
		});
	}
	for (const b of given) {
		solution.push({
			block_id: b.block_id,
			code: b.code,
			given: true,
			indent: b.indent,
			blanks: Array(countBlanks(b.code)).fill(''),
		});
	}

	return { starter, solution };
}

function deepCopyState(state) {
	return {
		starter: state.starter.map(b => ({ ...b, blanks: [...b.blanks], debug: b.debug || false })),
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
		const insertAt = Math.min(event.to_index, dst.length);
		dst.splice(insertAt, 0, block);

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
	const renderColumn = (blocks, containerId) => {
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
			div.style.marginLeft = (block.indent * 20) + 'px';
			div.innerHTML = renderBlockCode(block.code, block.blanks);
			el.appendChild(div);
		}
	};

	renderColumn(state.starter, 'replay-starter-blocks');
	renderColumn(state.solution, 'replay-solution-blocks');
}

function renderReplayStep(states, events, stepIndex) {
	const total = events.length;
	document.getElementById('replay-step-label').textContent =
		`Step ${stepIndex} / ${total}`;
	document.getElementById('replay-prev').disabled = stepIndex === 0;
	document.getElementById('replay-next').disabled = stepIndex === total;

	const labelEl = document.getElementById('replay-event-label');
	if (stepIndex === 0) {
		labelEl.textContent = 'Initial state';
		renderReplayBoard(states[0], null);
		return;
	}

	const event = events[stepIndex - 1];
	const blockLabel = event.block_code ? `"${escapeHtml(event.block_code)}"` : event.block_id;

	if (event.type === 'edit') {
		labelEl.innerHTML = `[edit] ${blockLabel} blank[${event.blank_index}] ← "<strong>${escapeHtml(event.value)}</strong>"`;
	} else {
		labelEl.innerHTML = `[move] ${blockLabel}: ${event.from_container}[${event.from_index}] → ${event.to_container}[${event.to_index}](indent=${event.to_indent})`;
	}

	renderReplayBoard(states[stepIndex], event.block_id);
}

async function initReplay(studentUsername, taskId, setId) {
	const loadingEl = document.getElementById('replay-loading');
	const boardEl = document.getElementById('replay-board');
	const controlsEl = document.getElementById('replay-controls');
	const eventLabelEl = document.getElementById('replay-event-label');

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
			eventLabelEl.textContent = '';
			document.getElementById('replay-step-label').textContent = 'No events recorded.';
			return;
		}

		// Precompute all board states
		const initialState = buildInitialState(initialBlocks);
		const states = [initialState];
		for (const event of events) {
			states.push(applyEvent(states[states.length - 1], event));
		}

		let currentStep = 0;
		renderReplayStep(states, events, currentStep);

		document.getElementById('replay-prev').addEventListener('click', () => {
			if (currentStep > 0) {
				currentStep--;
				renderReplayStep(states, events, currentStep);
			}
		});

		document.getElementById('replay-next').addEventListener('click', () => {
			if (currentStep < events.length) {
				currentStep++;
				renderReplayStep(states, events, currentStep);
			}
		});

		document.getElementById('replay-prev').disabled = false;
		document.getElementById('replay-next').disabled = events.length === 0;

	} catch (err) {
		console.error('Error initialising replay:', err);
		loadingEl.innerHTML = '<em class="text-danger">Error loading replay.</em>';
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
	document.getElementById('time-to-success').textContent =
		formatTime(data.time_to_first_success.seconds);
	}

	if (data.time_to_first_fail) {
	document.getElementById('time-to-fail').textContent =
		formatTime(data.time_to_first_fail.seconds);
	}

	if (data.thinking_time) {
	document.getElementById('thinking-time').textContent =
		formatTime(data.thinking_time.seconds);
	}
}

function showError(message) {
	const container = document.getElementById('page-header');
	container.className = 'empty-state';
	container.innerHTML = `
	<i class="fas fa-exclamation-triangle text-danger"></i>
	<h4>Error Loading Data</h4>
	<p>${escapeHtml(message || 'An unexpected error occurred.')}</p>
	<a href="/teacher-dashboard" class="btn btn-primary mt-3">Back to Task Sets</a>
	`;
}

// Toggle attempts list
const attemptsHeader = document.getElementById('attempts-header');
const attemptsList = document.getElementById('attempts-list');
const expandIcon = document.getElementById('expand-icon');

attemptsHeader.addEventListener('click', () => {
	attemptsList.classList.toggle('expanded');
	expandIcon.classList.toggle('expanded');
});

// Toggle replay
document.getElementById('replay-header').addEventListener('click', () => {
	document.getElementById('replay-content').classList.toggle('expanded');
	document.getElementById('replay-expand-icon').classList.toggle('expanded');
});

// Load statistics
fetch(`/api/students/${encodeURIComponent(studentUsername)}/tasks/${taskId}/statistics?set_id=${setId}`, {
	credentials: 'include'
})
	.then(r => {
	if (!r.ok) {
		if (r.status === 401) {
		window.location.href = '/';
		return;
		}
		throw new Error('Failed to load statistics');
	}
	return r.json();
	})
	.then(data => {
	renderHeader(data);
	renderTaskInstructions(data.task_instructions);
	renderModelAnswer(data.model_answer);
	renderAttempts(data.attempts_detail);
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

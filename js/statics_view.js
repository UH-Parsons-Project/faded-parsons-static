import { initSignedInAs, initProtectedPage } from '/js/auth-ui.js';
initSignedInAs();
initProtectedPage('/index.html');


const params = new URLSearchParams(window.location.search);
const taskId = params.get('id');
const problemsetCode = params.get('problemset');

function formatTime(seconds) {
	if (!seconds) return '0s';
	const mins = Math.floor(seconds / 60);
	const secs = Math.round(seconds % 60);
	return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function setStatGroup(avgId, minId, maxId, data) {
	document.getElementById(avgId).textContent = formatTime(data.avg);
	document.getElementById(minId).textContent = formatTime(data.min);
	document.getElementById(maxId).textContent = formatTime(data.max);
}

function escapeHtml(text) {
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}

if (taskId) {
	let apiUrl = `/api/tasks/${taskId}/statistics`;
	if (problemsetCode) apiUrl += `?problemset_code=${encodeURIComponent(problemsetCode)}`;

	fetch(apiUrl, { credentials: 'include' })
	.then(r => {
		if (!r.ok) throw new Error('Could not load statistics');
		return r.json();
	})
	.then(data => {
		document.getElementById('exercise-name').textContent = data.task_name || '—';
		document.getElementById('total-completions').textContent = data.total_completions ?? 0;
		document.getElementById('students-stats').textContent =
		`${data.students_completed ?? 0} / ${data.students_attempted ?? 0}`;
		document.getElementById('avg-tries').textContent = data.avg_tries ?? 0;

		if (data.model_answer) {
		document.getElementById('model-answer-box').style.display = 'block';
		document.getElementById('model-answer-code').textContent = data.model_answer;
		}

		if (data.time_to_first_fail) setStatGroup('tff-avg', 'tff-min', 'tff-max', data.time_to_first_fail);
		if (data.time_to_first_success) setStatGroup('tfs-avg', 'tfs-min', 'tfs-max', data.time_to_first_success);

		// Thinking time — not yet tracked
		if (data.thinking_time) {
		setStatGroup('think-avg', 'think-min', 'think-max', data.thinking_time);
		} else {
		document.getElementById('thinking-time-content').innerHTML =
			'<em class="text-muted">Not yet tracked.</em>';
		}

		// Number of moves — not yet tracked
		if (data.number_of_moves) {
		document.getElementById('moves-avg').textContent = data.number_of_moves.avg;
		document.getElementById('moves-min').textContent = data.number_of_moves.min;
		document.getElementById('moves-max').textContent = data.number_of_moves.max;
		} else {
		document.getElementById('moves-content').innerHTML =
			'<em class="text-muted">Not yet tracked.</em>';
		}

		// Common mistakes
		const logsDiv = document.getElementById('input-logs');
		if (data.common_mistakes?.length > 0) {
		let html = '<div style="margin-bottom:1rem"><strong>Most common mistakes:</strong></div>';
		data.common_mistakes.forEach((m, i) => {
			html += `
			<div class="mistake-block">
				<div class="mistake-label">
				Mistake #${i + 1} (occurred ${m.count} time${m.count > 1 ? 's' : ''})
				</div>
				<pre class="mistake-code"><code>${escapeHtml(m.code)}</code></pre>
			</div>`;
		});
		logsDiv.innerHTML = html;
		} else {
		logsDiv.innerHTML = '<em>No failed attempts recorded yet.</em>';
		}
	})
	.catch(err => {
		console.error('Error loading statistics:', err);
		document.getElementById('exercise-name').textContent = 'Error loading data';
		document.getElementById('input-logs').innerHTML = '<em>Could not load data.</em>';
	});
} else {
	document.getElementById('exercise-name').textContent = 'No task ID provided';
	document.getElementById('input-logs').innerHTML = '';
}
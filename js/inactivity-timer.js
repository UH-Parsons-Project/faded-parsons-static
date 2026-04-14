const WARN_AFTER_MS = 25 * 60 * 1000;    // show warning at 25 min
const REDIRECT_AFTER_MS = 30 * 60 * 1000; // redirect at 30 min

export async function initInactivityTimer(taskId, uniqueLinkCode, dashboardUrl) {
	let warnTimer = null;
	let redirectTimer = null;
	let pendingExitReason = null;
	let sessionId = null;

	// Use session created by /start (first visit) or create a new one via /enter (return visits)
	const storedSessionId = sessionStorage.getItem(`task_session_${taskId}`);
	if (storedSessionId) {
		sessionId = parseInt(storedSessionId, 10);
		sessionStorage.removeItem(`task_session_${taskId}`);
	} else {
		try {
			const res = await fetch(`/api/sets/${uniqueLinkCode}/tasks/${taskId}/enter`, { method: 'POST' });
			if (res.ok) sessionId = (await res.json()).session_id;
		} catch (_e) { /* session unavailable */ }
	}

	const sendExitBeacon = (reason) => {
		const payload = new Blob(
			[JSON.stringify({
				session_id: sessionId,
				exited_at: new Date().toISOString(),
				exit_reason: reason,
			})],
			{ type: 'application/json' }
		);
		navigator.sendBeacon(`/api/tasks/${taskId}/record-exit`, payload);
	};

	const hideWarning = () => {
		const el = document.getElementById('inactivity-warning');
		if (el) el.style.display = 'none';
		clearInterval(window._inactivityCountdown);
	};

	const showWarning = () => {
		const el = document.getElementById('inactivity-warning');
		if (el) el.style.display = 'flex';

		let secsLeft = 5 * 60;
		const cd = document.getElementById('inactivity-countdown');

		const tick = () => {
			if (cd) {
				const m = Math.floor(secsLeft / 60);
				const s = String(secsLeft % 60).padStart(2, '0');
				cd.textContent = `${m}:${s}`;
			}
			secsLeft--;
		};
		tick();
		window._inactivityCountdown = setInterval(tick, 1000);
	};

	const reset = () => {
		clearTimeout(warnTimer);
		clearTimeout(redirectTimer);
		hideWarning();

		warnTimer = setTimeout(showWarning, WARN_AFTER_MS);
		redirectTimer = setTimeout(async () => {
			pendingExitReason = 'inactivity_timeout';
			try {
				await fetch(`/api/sets/${uniqueLinkCode}/tasks/${taskId}/record-exit`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						session_id: sessionId,
						exited_at: new Date().toISOString(),
						exit_reason: 'inactivity_timeout',
					}),
				});
			} catch (_e) { /* best-effort — redirect regardless */ }
			window.location.href = dashboardUrl;
		}, REDIRECT_AFTER_MS);
	};

	// Reset on block moves / blank edits (dispatched by problem-element.js)
	document.addEventListener('student-activity', reset);

	// "I'm still here" button
	document.getElementById('still-here-btn')
		?.addEventListener('click', reset);

	// Back button — mark reason before pagehide fires
	document.getElementById('back-to-list')
		?.addEventListener('click', () => { pendingExitReason = 'manual_navigation'; });

	// Browser back button — intercept and redirect to task list instead of /start
	history.pushState(null, '', window.location.href);
	window.addEventListener('popstate', () => {
		pendingExitReason = 'manual_navigation';
		window.location.href = dashboardUrl;
	});

	// Page close / tab close / navigation away
	window.addEventListener('pagehide', () => {
		sendExitBeacon(pendingExitReason || 'page_close');
	});

	reset(); // start the timer
}

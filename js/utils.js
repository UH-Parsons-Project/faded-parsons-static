/**
 * Shared utility functions for the Parsons Code Lab frontend.
 */

/**
 * Loads the username from localStorage or fetches it from the API.
 * @param {string} [userNameElementId='user-name'] - The ID of the element to display the username in.
 */
export function loadUsername(userNameElementId = 'user-name') {
	const userNameEl = document.getElementById(userNameElementId);
	if (!userNameEl) return;

	const storedUsername = localStorage.getItem('username');
	if (storedUsername) {
		userNameEl.textContent = storedUsername;
	} else {
		fetch('/api/me', { credentials: 'include' })
			.then(r => (r.ok ? r.json() : Promise.reject()))
			.then(data => {
				if (data?.username) {
					userNameEl.textContent = data.username;
					localStorage.setItem('username', data.username);
				}
			})
			.catch(() => {
				userNameEl.textContent = '';
			});
	}
}

/**
 * Formats an ISO date string into a more readable format.
 * @param {string} isoString - The ISO date string to format.
 * @returns {string} The formatted date string (e.g., "Jan 1, 2023").
 */
export function formatDate(isoString) {
	if (!isoString) return 'N/A';
	const date = new Date(isoString);
	return date.toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	});
}

/**
 * Formats an ISO date string into a date-time format.
 * @param {string} isoString - The ISO date string to format.
 * @returns {string} The formatted date-time string.
 */
export function formatDateTime(isoString) {
	if (!isoString) return 'N/A';
	const date = new Date(isoString);
	return date.toLocaleString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
}

/**
 * Escapes HTML special characters in a string.
 * @param {string} text - The string to escape.
 * @returns {string} The escaped string.
 */
export function escapeHtml(text) {
	if (text === null || typeof text === 'undefined') {
		return '';
	}
	const div = document.createElement('div');
	div.textContent = String(text);
	return div.innerHTML;
}

/**
 * Displays an error message in a specified container.
 * @param {string} message - The error message to display.
 * @param {string} containerId - The ID of the container element.
 */
export function showError(message, containerId) {
	const container = document.getElementById(containerId);
	if (container) {
		container.className = 'empty-state';
		container.innerHTML = `
			<i class="fas fa-exclamation-triangle text-danger"></i>
			<h4>Error</h4>
			<p>${escapeHtml(message)}</p>
		`;
	}
}

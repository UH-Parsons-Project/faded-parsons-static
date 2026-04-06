/**
 * Authentication UI management module
 * Handles login forms, logout buttons, and authentication state display
 */

import { verifyAuth, getAuthToken, getUsername, setAuth, clearAuth } from './auth-utils.js';

function setExercisesButtonVisible(visible) {
	const exercisesBtn = document.getElementById('exercises-btn');
	if (exercisesBtn) {
		exercisesBtn.style.display = visible ? 'inline-block' : 'none';
	}
}

/**
 * Get the appropriate badge class for a user role
 */
function getRoleBadgeClass(role) {
	if (!role) return 'badge-light text-muted';

	switch(role.toLowerCase()) {
		case 'admin':
			return 'badge-warning';
		case 'teacher':
			return 'badge-info';
		case 'student':
			return 'badge-success';
		default:
			return 'badge-light text-muted';
	}
}

/**
 * Display a user role with appropriate styling
 */
function displayUserRole(roleElement, role) {
	if (!roleElement || !role) return;

	roleElement.textContent = role;
	roleElement.className = 'badge ' + getRoleBadgeClass(role);
	roleElement.style.display = 'inline';
	roleElement.style.marginLeft = '8px';
}

/**
 * Initialize login page authentication UI
 * Handles login form submission and checks if user is already logged in
 */
export function initLoginPage() {
	const loginForm = document.getElementById('login-form');
	const logoutBtn = document.getElementById('logout-btn');
	const userInfo = document.getElementById('user-info');
	const errorMessage = document.getElementById('error-message');
	const loginBtn = document.getElementById('login-btn');

	if (!loginForm) {
		console.error('Login form not found');
		return;
	}

	// Check if user is already logged in
	async function checkAuth() {
		const userData = await verifyAuth();
		if (userData) {
			showUserInfo(userData.username, userData.role);
		} else {
			showLoginForm();
		}
	}

	function showUserInfo(username, role) {
		loginForm.style.display = 'none';
		if (userInfo) {
			userInfo.style.display = 'block';
			const userNameElement = document.getElementById('user-name');
			if (userNameElement) {
				userNameElement.textContent = username;
			}
			const userRoleElement = document.getElementById('user-role');
			displayUserRole(userRoleElement, role);
		}
		setExercisesButtonVisible(true);
	}

	function showLoginForm() {
		loginForm.style.display = 'flex';
		if (userInfo) {
			userInfo.style.display = 'none';
		}
		setExercisesButtonVisible(false);
	}

	function showError(message) {
		if (errorMessage) {
			errorMessage.textContent = message;
			errorMessage.style.display = 'block';
			setTimeout(() => {
				errorMessage.style.display = 'none';
			}, 5000);
		}
	}

	// Handle login form submission
	loginForm.addEventListener('submit', async function(e) {
		e.preventDefault();
		const username = document.getElementById('username').value.trim();
		const password = document.getElementById('password').value;

		if (!username || !password) {
			showError('Please enter username and password');
			return;
		}

		// Disable button during request
		if (loginBtn) {
			loginBtn.disabled = true;
			loginBtn.textContent = 'Logging in...';
		}

		try {
			// If we're on a problemset page (/set/<code>) use student login
			const pathMatch = window.location.pathname.match(/^\/set\/([^/]+)/);
			if (pathMatch) {
				const code = pathMatch[1];
				const response = await fetch('/api/student_login', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ username, password, unique_link_code: code })
				});
				if (response.ok) {
					// Keep navbar greeting consistent on student pages.
					localStorage.setItem('nickname', username);
					// Student session cookie set by backend; redirect to tasks
					window.location.href = `/set/${code}/tasks`;
					return;
				} else {
					const err = await response.json();
					showError(err.detail || 'Login failed');
					return;
				}
			}

			// Fallback to teacher OAuth2 login for other pages
			const formData = new URLSearchParams();
			formData.append('username', username);
			formData.append('password', password);

			const response = await fetch('/api/login/access-token', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: formData
			});

			if (response.ok) {
				const data = await response.json();

				// Get user info using the token
				const userResponse = await fetch('/api/me', {
					headers: {
						'Authorization': `Bearer ${data.access_token}`
					}
				});

				if (userResponse.ok) {
					const userData = await userResponse.json();
					// Store token and username
					setAuth(data.access_token, userData.username);

					// Clear form
					document.getElementById('username').value = '';
					document.getElementById('password').value = '';

					// Show user info
					showUserInfo(userData.username, userData.role);

					// Redirect to exercise list
					window.location.href = '/task_list_selector';
				} else {
					showError('Failed to get user information');
				}
			} else {
				const error = await response.json();
				showError(error.detail || 'Login failed');
			}
		} catch (error) {
			showError('Network error. Please try again.');
			console.error('Login error:', error);
		} finally {
			if (loginBtn) {
				loginBtn.disabled = false;
				loginBtn.textContent = 'Login';
			}
		}
	});

	// Handle logout
	if (logoutBtn) {
		logoutBtn.addEventListener('click', async function() {
			const isStudentPage = window.location.pathname.startsWith('/set/');
			if (isStudentPage) {
				await fetch('/api/student_logout', { method: 'POST' });
				localStorage.removeItem('nickname');
			} else {
				await fetch('/api/logout', { method: 'POST' });
			}
			clearAuth();
			showLoginForm();
		});
	}

	// Handle register button
	const registerBtn = document.getElementById('register-btn');
	// console.log('Register button found:', registerBtn); // Debug log
	if (registerBtn) {
		registerBtn.addEventListener('click', function() {
			// console.log('Register button clicked'); // Debug log
			window.location.href = '/register';
		});
	}

	// If redirected from registration, focus username field
	const usernameInput = document.getElementById('username');
	const params = new URLSearchParams(window.location.search);
	if (params.get('focus') === 'username' && usernameInput) {
		usernameInput.focus();
	}

	// Check authentication on page load
	checkAuth();
}

/**
 * Initialize navbar exercises button visibility based on auth state.
 */
export async function initNavbarExercisesButton() {
	const userData = await verifyAuth();
	setExercisesButtonVisible(!!userData);
}

/**
 * Initialize protected page authentication UI
 * Verifies user is logged in and handles logout, redirects to login if not authenticated
 * @param {string} loginPageUrl - URL to redirect to if not authenticated (default: '/')
 */
export async function initProtectedPage(loginPageUrl = '/') {
	const token = getAuthToken();
	const username = getUsername();

	// If no token or username, redirect immediately
	if (!token || !username) {
		window.location.href = loginPageUrl;
		return;
	}

	// Verify token with backend
	const userData = await verifyAuth();
	if (!userData) {
		// Token invalid, redirect to login
		window.location.href = loginPageUrl;
		return;
	}

	// Update username in nav if element exists
	const userNameElement = document.getElementById('user-name');
	if (userNameElement) {
		userNameElement.textContent = userData.username;
	}

	// Update user role if element exists
	const userRoleElement = document.getElementById('user-role');
	displayUserRole(userRoleElement, userData.role);

	// Handle logout button
	const logoutBtn = document.getElementById('logout-btn');
	if (logoutBtn) {
		logoutBtn.addEventListener('click', async function() {
			// Call logout endpoint to clear cookie
			await fetch('/api/logout', { method: 'POST' });
			clearAuth();
			// Historically some pages expect the public index to be `/index.html`.
			// If the loginPageUrl is the root `/`, redirect explicitly to `/index.html`.
			if (loginPageUrl === '/') {
				window.location.href = '/index.html';
			} else {
				window.location.href = loginPageUrl;
			}
		});
	}
}

/**
 * Simple function to check auth and display username without redirecting
 * Useful for pages that want to show auth status but don't require login
 */
export async function displayAuthStatus() {
	const userData = await verifyAuth();

	if (userData) {
		const userNameElement = document.getElementById('user-name');
		if (userNameElement) {
			userNameElement.textContent = userData.username;
		}

		const userRoleElement = document.getElementById('user-role');
		displayUserRole(userRoleElement, userData.role);

		const userInfo = document.getElementById('user-info');
		const loginForm = document.getElementById('login-form');

		if (userInfo) userInfo.style.display = 'block';
		if (loginForm) loginForm.style.display = 'none';
		setExercisesButtonVisible(true);
	} else {
		setExercisesButtonVisible(false);
	}

	// Setup logout handler
	const logoutBtn = document.getElementById('logout-btn');
	if (logoutBtn) {
		logoutBtn.addEventListener('click', async function() {
			// Call logout endpoint to clear cookie
			await fetch('/api/logout', { method: 'POST' });
			clearAuth();
			window.location.reload();
		});
	}
}

/**
 * Initialize user name display on student pages
 * @param {string} userNameId - ID of the user name element
 * @param {string} userRoleId - ID of the user role element
 * @param {string} userInfoId - ID of the user info element
 * @param {boolean} preferNickname - Whether to prefer nickname over username
 */
export async function initSignedInAs({
	userNameId = 'user-name',
	userRoleId = 'user-role',
	userInfoId = 'user-info',
	preferNickname = false
} = {}) {
	const userNameEl = document.getElementById(userNameId);
	const userRoleEl = document.getElementById(userRoleId);
	const userInfoEl = document.getElementById(userInfoId);

	if (!userNameEl) return;

	let name = null;
	let role = null;

	// Student pages can prefer nickname
	if (preferNickname) {
		// Prefer student nickname, but fall back to stored username.
		name = localStorage.getItem('nickname') || localStorage.getItem('username');
		role = 'Student';
	} else {
		// Teacher flow
		name = localStorage.getItem('username');
	}

	// Safe backend fallback (already existing helper)
	if (!name) {
		const userData = await verifyAuth();
		if (userData?.username) {
			name = userData.username;
			role = userData.role;
			localStorage.setItem('username', name);
		}
	}

	// Cookie-session fallback for pages that don't have localStorage token.
	if (!name) {
		try {
			const response = await fetch('/api/me', { credentials: 'include' });
			if (response.ok) {
				const userData = await response.json();
				if (userData?.username) {
					name = userData.username;
					role = userData.role;
					localStorage.setItem('username', name);
				}
			}
		} catch (error) {
			console.error('Signed-in name fallback failed:', error);
		}
	}

	if (name) {
		userNameEl.textContent = name;
		displayUserRole(userRoleEl, role);
		if (userInfoEl) userInfoEl.style.display = 'block';
	} else {
		if (userInfoEl) userInfoEl.style.display = 'none';
	}
}

/**
 * Initialize student logout behavior for /set/{unique_link_code}/... pages.
 */
export function initStudentLogout({
	logoutButtonId = 'logout-btn',
	redirectFallback = '/'
} = {}) {
	const logoutBtn = document.getElementById(logoutButtonId);
	if (!logoutBtn) return;

	logoutBtn.addEventListener('click', async () => {
		await fetch('/api/student_logout', { method: 'POST' });
		localStorage.removeItem('nickname');

		const pathParts = window.location.pathname.split('/').filter(Boolean);
		const uniqueLinkCode = pathParts[1];
		window.location.href = uniqueLinkCode ? `/set/${uniqueLinkCode}` : redirectFallback;
	});
}

/**
 * Authentication UI management module
 * Handles login forms, logout buttons, and authentication state display
 */

import { authFetch, verifyAuth, getAuthToken, getUsername, setAuth, clearAuth } from './auth-utils.js';

function setExercisesButtonVisible(visible) {
	const exercisesBtn = document.getElementById('exercises-btn');
	if (exercisesBtn) {
		exercisesBtn.style.display = visible ? 'inline-block' : 'none';
	}
	const globalStatsBtn = document.getElementById('global-stats-btn');
	if (globalStatsBtn) {
		globalStatsBtn.style.display = visible ? 'inline-block' : 'none';
	}
	const burgerMenu = document.getElementById('navbar-burger-menu');
	if (burgerMenu) {
		burgerMenu.style.display = visible ? 'inline-block' : 'none';
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
	const teacherInstructions = document.getElementById('teacher-only-instructions');
	const logoLink = document.querySelector('.title-logo-link') || document.querySelector('.navbar-logo')?.closest('a');
	const teacherInstructionsLoadingMarkup = `
		<div class="instructions">
			<p class="mb-0 text-muted">Loading teacher instructions...</p>
		</div>
	`;
	const teacherInstructionsPlaceholderMarkup = `
		<div class="instructions">
			<p class="mb-0 text-muted">Log in to view the teacher-only instructions.</p>
		</div>
	`;
	let teacherInstructionsLoaded = false;
	let teacherInstructionsRequestInFlight = false;
	let teacherInstructionsLoadVersion = 0;

	if (!loginForm) {
		console.error('Login form not found');
		return;
	}

	function setLogoRedirectForAuth(isAuthenticated) {
		if (!logoLink) {
			return;
		}

		logoLink.href = isAuthenticated ? '/teacher-dashboard' : '/';
	}

	// Check if user is already logged in
	async function checkAuth() {
		const userData = await verifyAuth();
		if (userData) {
			showUserInfo(userData.username, userData.role);
			showTeacherInstructions();
		} else {
			showLoginForm();
		}
	}

	function showUserInfo(username, role) {
		loginForm.style.display = 'none';
		setLogoRedirectForAuth(true);
		if (userInfo) {
			userInfo.style.display = 'flex';
			const userNameElement = document.getElementById('user-name');
			if (userNameElement) {
				userNameElement.textContent = username;
			}
			const userRoleElement = document.getElementById('user-role');
			displayUserRole(userRoleElement, role);
		}
		setExercisesButtonVisible(true);
	}

	function showTeacherInstructions() {
		if (teacherInstructions) {
			teacherInstructions.style.display = 'block';
			if (!teacherInstructionsLoaded && !teacherInstructionsRequestInFlight) {
				teacherInstructionsLoadVersion += 1;
				teacherInstructions.innerHTML = teacherInstructionsLoadingMarkup;
				loadTeacherInstructions(teacherInstructionsLoadVersion);
			}
		}
	}

	function hideTeacherInstructions() {
		if (teacherInstructions) {
			teacherInstructions.style.display = 'none';
			teacherInstructions.innerHTML = teacherInstructionsPlaceholderMarkup;
			teacherInstructionsLoaded = false;
			teacherInstructionsRequestInFlight = false;
			teacherInstructionsLoadVersion += 1;
		}
	}

	async function loadTeacherInstructions(loadVersion) {
		if (!teacherInstructions || teacherInstructionsRequestInFlight) {
			return;
		}

		teacherInstructionsRequestInFlight = true;

		try {
			const response = await authFetch('/instructions/teacher-content');
			if (!response.ok) {
				throw new Error(`Failed to load teacher instructions: ${response.status}`);
			}

			if (loadVersion !== teacherInstructionsLoadVersion) {
				return;
			}

			teacherInstructions.innerHTML = await response.text();
			teacherInstructionsLoaded = true;
		} catch (error) {
			if (loadVersion !== teacherInstructionsLoadVersion) {
				return;
			}

			console.error('Teacher instructions load error:', error);
			teacherInstructions.innerHTML = `
				<div class="instructions">
					<p class="text-danger mb-0">Could not load teacher instructions.</p>
				</div>
			`;
		} finally {
			if (loadVersion === teacherInstructionsLoadVersion) {
				teacherInstructionsRequestInFlight = false;
			}
		}
	}

	function showLoginForm() {
		loginForm.style.display = 'flex';
		setLogoRedirectForAuth(false);
		if (userInfo) {
			userInfo.style.display = 'none';
		}
		hideTeacherInstructions();
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
			showError('Please enter username or email and password');
			return;
		}

		// Disable button during request
		if (loginBtn) {
			loginBtn.disabled = true;
			loginBtn.textContent = 'Logging in...';
		}

		try {
			// If we're on a task_set page (/{username}/set/<code>) use student login
			const pathMatch = window.location.pathname.match(/^\/([^/]+)\/set\/([^/]+)/);
			if (pathMatch) {
				const teacherUsername = pathMatch[1];
				const code = pathMatch[2];
				const response = await fetch('/api/student_login', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ username, password, unique_link_code: code })
				});
				if (response.ok) {
					const data = await response.json();
					const displayName = data.username || username;
					// Keep navbar greeting consistent on student pages.
					localStorage.setItem('nickname', displayName);
					// Student session cookie set by backend; redirect to tasks
					window.location.href = `/${teacherUsername}/set/${code}/tasks`;
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
					window.location.href = '/teacher-dashboard';
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
			const isStudentPage = /^\/[^/]+\/set\//.test(window.location.pathname);
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
			window.location.href = '/teacher-register';
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

			// Hide user info elements immediately
			const userInfo = document.getElementById('user-info');
			if (userInfo) userInfo.style.display = 'none';

			// Hide user-name span and logout button if not in user-info div
			const userNameSpan = document.querySelector('#user-name')?.parentElement;
			if (userNameSpan && !userInfo?.contains(userNameSpan)) {
				userNameSpan.style.display = 'none';
			}
			if (logoutBtn && !userInfo?.contains(logoutBtn)) {
				logoutBtn.style.display = 'none';
			}

			// Redirect with cache-busting query parameter to force page reload
			window.location.href = loginPageUrl + '?' + new Date().getTime();
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
		const userInfo = document.getElementById('user-info');
		const loginForm = document.getElementById('login-form');

		if (userInfo) userInfo.style.display = 'none';
		if (loginForm) loginForm.style.display = 'flex';
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
	// Store last visited task set URL in localStorage
	const currentPath = window.location.pathname;
	const setMatch = currentPath.match(/^\/[^/]+\/set\/[^/]+/);
	if (setMatch) {
		localStorage.setItem('last_task_set_url', setMatch[0] + '/tasks');
	}

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
 * Initialize student logout behavior for /{username}/set/{unique_link_code}/... pages.
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
		const username = pathParts[0];
		const uniqueLinkCode = pathParts[2];
		window.location.href = (username && uniqueLinkCode) ? `/${username}/set/${uniqueLinkCode}` : redirectFallback;
	});
}

/**
 * Initialize burger menu for teacher pages
 */
export function initBurgerMenu() {
	const toggle = document.getElementById('navbar-burger-toggle');
	const dropdown = document.getElementById('navbar-burger-dropdown');

	if (!toggle || !dropdown) return;

	// Toggle dropdown on button click
	toggle.addEventListener('click', (e) => {
		e.stopPropagation();
		dropdown.classList.toggle('show');
		toggle.setAttribute('aria-expanded', dropdown.classList.contains('show'));
	});

	// Close dropdown when clicking on a link
	const links = dropdown.querySelectorAll('.navbar-burger-item');
	links.forEach(link => {
		link.addEventListener('click', () => {
			dropdown.classList.remove('show');
			toggle.setAttribute('aria-expanded', 'false');
		});
	});

	// Close dropdown when clicking outside
	document.addEventListener('click', (e) => {
		if (!e.target.closest('.navbar-burger-menu')) {
			dropdown.classList.remove('show');
			toggle.setAttribute('aria-expanded', 'false');
		}
	});
}

/**
 * Dynamic CDN loader for Driver.js
 */
async function loadDriverJSAndCSS() {
	return new Promise((resolve, reject) => {
		// Check and load CSS
		if (!document.querySelector('link[href*="driver.css"]')) {
			const link = document.createElement('link');
			link.rel = 'stylesheet';
			link.href = 'https://cdn.jsdelivr.net/npm/driver.js@1.3.1/dist/driver.css';
			document.head.appendChild(link);
		}

		// Check if script is already loaded
		if (window.driver && window.driver.js && window.driver.js.driver) {
			resolve();
			return;
		}

		const script = document.createElement('script');
		script.src = 'https://cdn.jsdelivr.net/npm/driver.js@1.3.1/dist/driver.js.iife.js';
		script.onload = () => {
			if (window.driver && window.driver.js && window.driver.js.driver) {
				resolve();
			} else {
				reject(new Error('Driver.js global object not found after loading'));
			}
		};
		script.onerror = () => reject(new Error('Failed to load Driver.js script'));
		document.body.appendChild(script);
	});
}

/**
 * Path check helper for teacher-oriented views
 */
function shouldShowHelpTour(pathname) {
	const teacherPaths = [
		'/teacher-dashboard',
		'/create-task',
		'/create-task-editor',
		'/create-task-set',
		'/global-statistics',
		'/all-tasksets',
		'/all-users',
		'/admin-dashboard',
		'/task-set-overview',
		'/teacher/profile',
		'/task-statistics'
	];
	return teacherPaths.some(p => pathname.startsWith(p));
}

/**
 * Return Driver.js steps configured specifically for the active pathname
 */
function getTourStepsForPath(pathname) {
	// Dashboard Tour
	if (pathname.startsWith('/teacher-dashboard')) {
		const dashboardSteps = [
			{
				element: '.page-header',
				popover: {
					title: 'Teacher Dashboard',
					description: 'Welcome to your main workspace! Here you can create tasks, manage your task sets, and monitor student progress.',
					side: 'bottom'
				}
			}
		];

		// Check if admin dashboard button is visible
		const adminBtn = document.getElementById('all-sets-button');
		if (adminBtn && window.getComputedStyle(adminBtn).display !== 'none') {
			dashboardSteps.push({
				element: '#all-sets-button',
				popover: {
					title: 'Admin Controls',
					description: 'As an administrator, click here to access the Admin Dashboard to manage users, task sets and see usage data.',
					side: 'bottom'
				}
			});
		}

		dashboardSteps.push(
			{
				element: '#global-stats-btn',
				popover: {
					title: 'Global Statistics',
					description: 'Access all public tasks, view global statistics and find the right tasks for your own task sets.',
					side: 'bottom'
				}
			},
			{
				element: '#instructions-btn',
				popover: {
					title: 'Help Documentation',
					description: 'Access the general more detailed instructions for using the Parsons Code Lab.',
					side: 'bottom'
				}
			},
			{
				element: '#task-sets-container',
				popover: {
					title: 'My Task Sets',
					description: 'Here are all the task sets you have created or have been shared with you. Search for a specific task set by task set title.',
					side: 'right'
				}
			}
		);

		// Conditional step: highlight first created task set if it exists
		const firstTaskSetItem = document.querySelector('#task-sets-container .task-set-item');
		if (firstTaskSetItem) {
			dashboardSteps.push({
				element: firstTaskSetItem,
				popover: {
					title: 'Created Task Set',
					description: 'Here is one of your created task sets. Click it to access the task set overview, or copy the URL to share it with your students.',
					side: 'right'
				}
			});
		}

		dashboardSteps.push(
			{
				element: '#your-tasks-container',
				popover: {
					title: 'My Tasks List',
					description: 'View, edit, and preview all the individual programming tasks you have created. Tasks can be edited or deleted if they are not yet in use.',
					side: 'left'
				}
			}
		);

		// Conditional step: highlight first created task if it exists
		const firstTaskItem = document.querySelector('#your-tasks-container .task-set-item');
		if (firstTaskItem) {
			dashboardSteps.push({
				element: firstTaskItem,
				popover: {
					title: 'Created Task',
					description: 'Here is one of your created tasks. Click it to preview the task how students will see it. You can also edit or delete it if not in use, or access the Global statistics of the task(not limited to your students).',
					side: 'left'
				}
			});
		}

		dashboardSteps.push(
			{
				element: '.navbar .ml-auto',
				popover: {
					title: 'Account Settings',
					description: 'Change profile settings, access all quick links, or sign out of your account.',
					side: 'left'
				}
			}
		);

		return dashboardSteps;
	}

	// Create Task Set Tour
	if (pathname.startsWith('/create-task-set')) {
		return [
			{
				element: '.create-task-set-container h1',
				popover: {
					title: 'Create Task Set',
					description: 'Group multiple tasks together for a specific class or assignment.',
					side: 'bottom'
				}
			},
			{
				element: '#task-set-title',
				popover: {
					title: 'Task Set Title',
					description: 'Enter a descriptive title for your student group (e.g., "Python Basics Week 1").',
					side: 'bottom'
				}
			},
			{
				element: '#student-description',
				popover: {
					title: 'Student Descriptions',
					description: 'Add an optional description visible to students on their starting page.',
					side: 'bottom'
				}
			},
			{
				element: '#viewer-identifiers',
				popover: {
					title: 'Collaborating Teachers',
					description: 'Enter usernames or emails of other teachers to grant them viewing rights to this task set.',
					side: 'bottom'
				}
			},
			{
				element: '#set-expiration',
				popover: {
					title: 'Deadline Expiration',
					description: 'Check this box and specify a date/time if you want this task set to close automatically at a deadline.',
					side: 'bottom'
				}
			},
			{
				element: '#task-selector',
				popover: {
					title: 'Select Exercises',
					description: 'Select the coding problems you want to include in this set. You can preview exercises here too.',
					side: 'top'
				}
			},
			{
				element: 'button[type="submit"]',
				popover: {
					title: 'Save and Deploy',
					description: 'Click "Create Task Set" to save and generate a unique student join link.',
					side: 'top'
				}
			}
		];
	}

	// Create Task (Plain Editor) Tour
	if (pathname.startsWith('/create-task') && !pathname.startsWith('/create-task-editor')) {
		return [
			{
				element: '.page-title',
				popover: {
					title: 'Create a New Task',
					description: 'Define the programming exercise and write unit tests to validate student answers.',
					side: 'bottom'
				}
			},
			{
				element: '#task-code',
				popover: {
					title: 'Task Code Model Solution',
					description: 'Write the complete model solution in Python here. Students will rearrange these lines to reconstruct this code.',
					side: 'bottom'
				}
			},
			{
				element: '#task-tests',
				popover: {
					title: 'Unit Test Cases',
					description: 'Write Python tests to validate the student\'s code. Standard unittest or assert statements work here.',
					side: 'top'
				}
			},
			{
				element: '#submit-task',
				popover: {
					title: 'Continue to Block Builder',
					description: 'Save your code and tests to advance to the next step, where you configure custom code blocks.',
					side: 'top'
				}
			}
		];
	}

	// Create Task Editor / Block Builder Tour
	if (pathname.startsWith('/create-task-editor')) {
		return [
			{
				element: '.card-header',
				popover: {
					title: 'Block Builder & Instructions',
					description: 'In this second phase, you write exercise instructions and customize the draggable code blocks.',
					side: 'bottom'
				}
			},
			{
				element: '#task-title',
				popover: {
					title: 'Task Title',
					description: 'Enter a descriptive title for this coding exercise.',
					side: 'bottom'
				}
			},
			{
				element: '#problem-description',
				popover: {
					title: 'Problem Description',
					description: 'Write clear instructions for students explaining what the function is supposed to do.',
					side: 'bottom'
				}
			},
			{
				element: '#start-description',
				popover: {
					title: 'Start Page Introduction',
					description: 'Write a short description displayed to students before starting the exercise.',
					side: 'bottom'
				}
			},
			{
				element: '#submit-task',
				popover: {
					title: 'Validate and Publish',
					description: 'Click this button once all your tests pass to save the task to the global exercises pool.',
					side: 'top'
				}
			}
		];
	}

	// Fallback Tour
	return [
		{
			element: '.navbar',
			popover: {
				title: 'Need Help?',
				description: 'Access the global menu or navigate to the comprehensive instructions manual for complete guidance.',
				side: 'bottom'
			}
		}
	];
}

/**
 * Injects and initializes the global tour widget
 */
function initGlobalHelpTour() {
	if (!shouldShowHelpTour(window.location.pathname)) {
		return;
	}

	// Check if already injected
	if (document.getElementById('floating-help-btn')) {
		return;
	}

	// Injects style
	const style = document.createElement('style');
	style.textContent = `
		.floating-help-btn {
			position: fixed;
			bottom: 24px;
			right: 24px;
			width: 48px;
			height: 48px;
			border-radius: 50%;
			background: #2b2b2b;
			color: #ffffff;
			border: 2px solid #ffffff;
			box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
			cursor: pointer;
			display: flex;
			align-items: center;
			justify-content: center;
			font-size: 1.1rem;
			z-index: 9999;
			transition: background 0.2s, transform 0.2s, box-shadow 0.2s;
		}
		.floating-help-btn:hover {
			background: #111111;
			transform: scale(1.08);
			box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35);
			outline: none;
		}
		.floating-help-btn:focus {
			outline: none;
		}
	`;
	document.head.appendChild(style);

	// Injects button
	const btn = document.createElement('button');
	btn.id = 'floating-help-btn';
	btn.className = 'floating-help-btn';
	btn.title = 'Start Help Tour';
	btn.innerHTML = '<i class="fas fa-question"></i>';
	document.body.appendChild(btn);

	btn.addEventListener('click', async () => {
		btn.disabled = true;
		btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
		try {
			await loadDriverJSAndCSS();
			const driverObj = window.driver.js.driver({
				showProgress: true,
				steps: getTourStepsForPath(window.location.pathname)
			});
			driverObj.drive();
		} catch (err) {
			console.error('Failed to launch help tour:', err);
		} finally {
			btn.disabled = false;
			btn.innerHTML = '<i class="fas fa-question"></i>';
		}
	});
}

// Automatically bind to DOMContentLoaded to run dynamic widget injection
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initGlobalHelpTour);
} else {
	initGlobalHelpTour();
}

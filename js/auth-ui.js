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
		'/task-set-overview',
		'/heatmap',
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

	// Task Set Overview Tour
	if (pathname.startsWith('/task-set-overview')) {
		return [
			{
				element: '.taskset-page-title',
				popover: {
					title: 'Task Set Title',
					description: 'Welcome to you task set! Here you can view and manage your task set, including student join links and shared viewers.',
					side: 'bottom'
				}
			},
			{
				element: 'a[href*="heatmap"]',
				popover: {
					title: 'Completion Heatmap',
					description: 'Access the Completion Heatmap, where you can see the completion progress of your students in a simple table format.',
					side: 'bottom'
				}
			},
			{
				element: '.csv-buttons-group',
				popover: {
					title: 'Download CSVs',
					description: 'You can download the CSV for all data available of each task, or the Teacher CSV that has a simple table of what tasks each student has completed',
					side: 'bottom'
				}
			},
			{
				element: '.taskset-link-box',
				popover: {
					title: 'Student Join Link',
					description: 'Share this unique link with your students to allow them to join your task set. After login in students will be able to do all active tasks in the task set.',
					side: 'bottom'
				}
			},
			{
				element: '#expiry-section',
				popover: {
					title: 'Expiry',
					description: 'Set or edit your expiry date and time. After expiry, the task set will no longer be available to students, but teachers will still be able to view all data like normal.',
					side: 'bottom'
				}
			},
			{
				element: '.header-viewers',
				popover: {
					title: 'Shared Viewers',
					description: 'Here you can manage shared viewers. Giving viewing rights allows the teacher to view all data in this task set, including student specific data.',
					side: 'bottom'
				}
			},
			{
				element: '.header-stats',
				popover: {
					title: 'Statistics',
					description: 'Here you can have a quick look at how many students have joind and overview on how they are doing.',
					side: 'bottom'
				}
			},
			{
				element: '.descriptions-wrapper',
				popover: {
					title: 'Notes and Instructions',
					description: '<strong>Teacher Notes</strong> are visuable to you and teachers with viewing rights. Students will never see this. <strong>Student Instructions</strong> are visuable to students on the main dashboard when they open this task set. ',
					side: 'bottom'
				}
			},
			{
				element: '#tasks-list',
				popover: {
					title: 'Tasks List',
					description: 'These are all tasks within your task set. By clicking on a task you can view the tasks statistics. Tasks can be deactivated, which hides them from all students. They can be reactivated if needed. No data is lost by deactivation, but make sure no students are attempting the task before deactivation.',
					side: 'right'
				}
			},
			{
				element: '#students-list',
				popover: {
					title: 'Students List',
					description: 'All students that have enrolled through your shared link. Clicking a student opens their overview and allowing to view task specific statistics.',
					side: 'left'
				}
			},
			{
				element: '.navbar .ml-auto',
				popover: {
					title: 'Account Settings',
					description: 'Change profile settings, access all quick links, or sign out of your account.',
					side: 'left'
				}
			}
		];
	}

	// Heatmap Tour
	if (pathname.startsWith('/heatmap')) {
		return [
			{
				element: '.taskset-page-title',
				popover: {
					title: 'Completion Heatmap',
					description: 'Welcome to the Completion Heatmap! This interactive grid provides a high-level visual overview of how all students are progressing through the tasks in this set.',
					side: 'bottom'
				}
			},
			{
				element: '#hm-controls',
				popover: {
					title: 'Sort Controls',
					description: 'Use these controls to sort the student list. You can sort alphabetically by <b>Student Name</b>, or by progression: <b>Most complete</b> (or most attempts if not completed) or <b>Least complete</b> (or least attempts if) ',
					side: 'bottom'
				}
			},
			{
				element: '.hm-corner-th:not(.hm-corner-rate)',
				popover: {
					title: 'Student Column & Struggling Badges',
					description: 'This column lists student names. If a student is failing or struggling with multiple tasks (3 or more tasks with high attempt counts without success), a red <b>Struggling</b> badge will appear next to their name.',
					side: 'right'
				}
			},
			{
				element: '.hm-task-th',
				popover: {
					title: 'Task Columns & Modal Previews',
					description: 'Columns correspond to individual tasks in this set (labeled T1, T2, etc.). <b>Clicking on a task header</b> opens a quick preview of what the task is.',
					side: 'bottom'
				}
			},
			{
				element: '.hm-corner-rate',
				popover: {
					title: 'Task Completion Rates',
					description: 'This row shows the overall percentage of enrolled students who have successfully completed each task.',
					side: 'right'
				}
			},
			{
				element: '.hm-cell-td',
				popover: {
					title: 'Status Cells',
					description: 'Each cell represents a student\'s attempt status on a task. Hovering over any cell reveals a detailed tooltip showing the status, total attempts, and last active timestamp. <b>Clicking a cell</b> opens student-task-specific statistics.',
					side: 'top'
				}
			},
			{
				element: '.hm-prog-td',
				popover: {
					title: 'Individual Progress',
					description: 'The progress column shows the completion ratio and percentage for each individual student over all tasks',
					side: 'left'
				}
			},
			{
				element: '#hm-legend',
				popover: {
					title: 'Legend & Quick Info',
					description: 'Refer to this legend to quickly identify the color codes and status states used in the heatmap table.',
					side: 'top'
				}
			}
		];
	}

	// Exercise Analytics Tour
	if (pathname.startsWith('/task-statistics')) {
		const steps = [
			{
				element: '.page-header',
				popover: {
					title: 'Exercise Analytics',
					description: 'Welcome to the Exercise Analytics page! Here you can analyze student attempts, completion rates, time spent, common mistakes, and more.',
					side: 'bottom'
				}
			}
		];

		// Check if sidebar is visible
		const sidebar = document.querySelector('.student-sidebar');
		if (sidebar && window.getComputedStyle(sidebar).display !== 'none') {
			steps.push({
				element: '.student-sidebar',
				popover: {
					title: 'Student Overview Sidebar',
					description: 'This sidebar lists all enrolled students grouped by their completion status: <b>Completed</b>, <b>Not Yet Completed</b>, or <b>Not Started</b>. Click a student\'s name to view their individual attempts.',
					side: 'right'
				}
			});
		}

		steps.push(
			{
				element: '.kpi-strip',
				popover: {
					title: 'Key Performance Indicators',
					description: 'Quickly see high-level statistics from this task.',
					side: 'bottom'
				}
			},
			{
				element: '#time-toggle-container',
				popover: {
					title: 'Time Metric Toggle',
					description: 'Switch time metrics. <b>Total / Wall-clock</b> time is a absolute value from the start of the task to the completion timestamp, including time when the task was not open in the browser. <b>Active / On-page</b> time only measures the time the student had the task open in their browser (and not inactive for more then 30min).',
					side: 'bottom'
				}
			}
		);

		// Check if time metric shows raw numbers (insufficient data for box plot)
		const showsNumbers = document.querySelector('.time-metric:not(:has(.bp-svg-wrap))');
		if (showsNumbers) {
			steps.push({
				element: '.time-metric:not(:has(.bp-svg-wrap))',
				popover: {
					title: 'Time Metrics (Text View)',
					description: 'When there are fewer than 5 attempts, there is insufficient data to construct a box plot. Instead, this section shows the raw <b>minimum</b>, <b>median</b>, <b>average</b>, and <b>maximum</b> values directly.',
					side: 'top'
				}
			});
		}

		// Check if time metric shows box plot
		const showsBoxPlot = document.querySelector('.time-metric:has(.bp-svg-wrap)');
		if (showsBoxPlot) {
			steps.push({
				element: '.time-metric:has(.bp-svg-wrap)',
				popover: {
					title: 'Time Metrics (Box Plot View)',
					description: 'With 5 or more attempts, this interactive <b>Box Plot</b> is generated showing the distribution of time or moves:<br>- <b>Box</b>: Middle 50% of students.<br>- <b>Vertical Line</b>: Median value.<br>- <b>Diamond</b>: Average (mean) value.<br>- <b>Whiskers</b>: Outlier limits.<br>- <b>Dots</b>: Individual outliers. Hovering shows accurate time stamps.',
					side: 'top'
				}
			});
		}

		steps.push({
			element: '.completion-card',
			popover: {
				title: 'Completion Details',
				description: 'Displays a visual breakdown of completion status, average/min/max attempts to pass, and page exits (how often students left the task tab).',
				side: 'left'
			}
		});

		// Check if mistakes box is visible
		const mistakesBox = document.getElementById('mistakes-box');
		if (mistakesBox && window.getComputedStyle(mistakesBox).display !== 'none') {
			steps.push({
				element: '#mistakes-box',
				popover: {
					title: 'Most Common Mistakes',
					description: 'Lists the five most frequently submitted incorrect solutions, helping you identify common mistakes.',
					side: 'top'
				}
			});
		}

		steps.push({
			element: '#model-answer-box',
			popover: {
				title: 'Model Answer',
				description: 'Shows the model answer set for this task. Note: there can be more then one correct answer to some tasks.',
				side: 'top'
			}
		});

		// Check if custom errors box is visible
		const customErrorsBox = document.getElementById('custom-errors-box');
		if (customErrorsBox && window.getComputedStyle(customErrorsBox).display !== 'none') {
			steps.push({
				element: '#custom-errors-box',
				popover: {
					title: 'Custom Error Messages',
					description: 'Displays custom feedback and hints configured for specific incorrect student submissions.',
					side: 'top'
				}
			});
		}

		return steps;
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

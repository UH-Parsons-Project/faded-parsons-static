// @ts-check
/* eslint-env node */
/**
 * Shared test helper functions for Playwright tests
 */

/**
 * Generate a random alphanumeric token
 * @param {number} length - Length of token (default 15)
 * @returns {string} Random token
 */
function generateRandomToken(length = 15) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < length; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

/**
 * Get a valid registration token
 * In test mode, tokens are created by the seed function from environment variable
 * @returns {string} A valid registration token
 */
function getTestRegistrationToken() {
  // The seed_db function creates this token during test setup
  // using the TEACHER_REGISTRATION_TOKEN environment variable
  return process.env.TEACHER_REGISTRATION_TOKEN || generateRandomToken(15);
}

/**
 * Register a teacher using a registration token
 * @param {any} page - Playwright page object
 * @param {string} username - Teacher username
 * @param {string} email - Teacher email
 * @param {string} password - Teacher password (default: 'password123')
 * @param {string} registrationToken - Registration token (default: from env or generated)
 */
export async function registerTeacher(
  page,
  username,
  email,
  password = 'password123',
  registrationToken = getTestRegistrationToken()
) {
  await page.goto('/register');
  await page.locator('#username').fill(username);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#password_confirm').fill(password);
  await page.locator('#registration_token').fill(registrationToken);
  await page.locator('#register-form button[type="submit"]').click();
}

/**
 * Login a teacher
 * @param {any} page - Playwright page object
 * @param {string} username - Teacher username
 * @param {string} password - Teacher password
 */
export async function loginTeacher(page, username, password) {
  await page.goto('/');
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.locator('#login-btn').click();
}

/**
 * Create a task list with random tasks
 * @param {any} page - Playwright page object
 * @param {string} taskListTitle - Title of the task list
 * @param {string} studentDescription - Description for students
 * @param {string} teacherDescription - Description for teachers
 */
export async function createTaskList(
  page,
  taskListTitle,
  studentDescription,
  teacherDescription
) {
  await page.locator('text=Create New Task List').click();
  await page.locator('#task-list-title').fill(taskListTitle);
  await page.locator('#student-description').fill(studentDescription);
  await page.locator('#teacher-description').fill(teacherDescription);
  await page.waitForSelector('.task-item', { timeout: 10000 });
  const taskItems = await page.locator('.task-item').all();
  const tasksToSelect = Math.min(3, taskItems.length);
  const selectedIndices = new Set();

  while (selectedIndices.size < tasksToSelect) {
    selectedIndices.add(Math.floor(Math.random() * taskItems.length));
  }

  for (const index of selectedIndices) {
    await taskItems[index].click();
  }

  await page.locator('#create-task-set-form button[type="submit"]').click();
}

export async function createTaskListWithTasks(page, taskListTitle, studentDescription, teacherDescription, taskNames) {
  await page.locator('text=Create New Task List').click();
  await page.locator('#task-list-title').fill(taskListTitle);
  await page.locator('#student-description').fill(studentDescription);
  await page.locator('#teacher-description').fill(teacherDescription);
  await page.waitForSelector('.task-item', { timeout: 10000 });

  for (const name of taskNames) {
    await page.locator('.task-item', { has: page.locator('.task-item-title', { hasText: name }) }).click();
  }

  await page.locator('#create-task-set-form button[type="submit"]').click();
}

export async function registerStudent(page, username, email, password = 'password123') {
  // Click register and wait for the student register page to load (some pages navigate)
  await Promise.all([
    page.waitForURL(/student_register|\/student_register/),
    page.locator('#register-btn').click(),
  ]);

  // Ensure the register form is present before interacting
  await page.waitForSelector('#register-form', { timeout: 10000 });

  await page.locator('#username').fill(username);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#password_confirm').fill(password);
  await page.locator('#register-form button[type="submit"]').click();
}

export async function loginStudent(page, username, password = 'password123') {
  await page.locator('#login-form #username').fill(username);
  await page.locator('#login-form #password').fill(password);
  await page.locator('#login-btn').click();
}

export async function getStudentUrl(page, taskListTitle) {
  await page.locator('.task-list-title', { hasText: taskListTitle }).click();
  await page.waitForSelector('#link-code', { timeout: 10000 });
  const studentUrl = (await page.locator('#link-code').textContent()).trim();
  return studentUrl;
}

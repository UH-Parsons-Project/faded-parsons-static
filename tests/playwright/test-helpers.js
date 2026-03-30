// @ts-check
/* eslint-env node */
/**
 * Shared test helper functions for Playwright tests
 */

const teacherRegistrationToken = process.env.TEACHER_REGISTRATION_TOKEN;

export async function registerTeacher(
  page,
  username,
  email,
  password = 'password123',
  registrationToken = teacherRegistrationToken
) {
  await page.goto('/register');
  await page.locator('#username').fill(username);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#password_confirm').fill(password);
  await page.locator('#registration_token').fill(registrationToken);
  await page.locator('#register-form button[type="submit"]').click();
}

export async function loginTeacher(page, username, password) {
  await page.goto('/');
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.locator('#login-btn').click();
}

export async function createTaskList(page, taskListTitle, studentDescription, teacherDescription) {
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

  await page.locator('#create-task-list-form button[type="submit"]').click();
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

  await page.locator('#create-task-list-form button[type="submit"]').click();
}

export async function registerStudent(page, username, email, password = 'password123') {
  await page.locator('#register-btn').click();
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
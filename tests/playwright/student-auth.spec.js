// @ts-check
import { test, expect } from '@playwright/test';
import { registerTeacher, loginTeacher, createTaskList } from './test-helpers.js';

// Before testing student registration and login, we need to create a teacher account and a task list for the student to access
test.beforeEach(async ({ page }) => {
  const unique = Date.now();
  const teacherUsername = `teacher_${unique}`;
  const teacherEmail = `teacher_${unique}@example.com`;
  const teacherPassword = 'password123';

  await registerTeacher(page, teacherUsername, teacherEmail, teacherPassword);
  await page.waitForSelector('#alert-placeholder .alert-success', { timeout: 10000 });
  await expect(page.locator('#alert-placeholder .alert-success')).toContainText(
    'Registration successful.'
  );

  await loginTeacher(page, teacherUsername, teacherPassword);
  await createTaskList(
    page,
    `Student Test List ${unique}`,
    `Student description for Student Test List ${unique}.`,
    `Teacher description for Student Test List ${unique}.`
  );
  await page.waitForURL(/\/task_list_selector$/, { timeout: 10000 });
  await expect(page).toHaveURL(/\/task_list_selector$/);
  await page.locator('.task-list-title', { hasText: `Student Test List ${unique}` }).click();

  // Wait for the statistics page to load and extract the student-facing URL from #link-code
  await page.waitForSelector('#link-code');
  const studentUrl = await page.locator('#link-code').textContent();
  // Store the URL in test.info().annotations for access in the test
  test.info().annotations.push({ type: 'studentUrl', description: studentUrl });
});


test('student can register and then login from task list page', async ({ browser }) => {
  // Get the tasklist URL from test.info().annotations
  const annotation = test.info().annotations.find(a => a.type === 'studentUrl');
  if (!annotation) throw new Error('Student URL not found in test annotations');
  const studentUrl = annotation.description.trim();

  // Start the test from the student tasklist URL in a fresh browser
  const context = await browser.newContext();
  const studentPage = await context.newPage();
  await studentPage.goto(studentUrl);

  // Register a new student account by pressing register button and filling out the form
  await studentPage.locator('#register-btn').click();
  const unique = Date.now() % 1000000;
  const studentUsername = `student_${unique}`;
  const studentEmail = `student_${unique}@example.com`;
  const studentPassword = 'password123';

  await studentPage.locator('#username').fill(studentUsername);
  await studentPage.locator('#email').fill(studentEmail);
  await studentPage.locator('#password').fill(studentPassword);
  await studentPage.locator('#password_confirm').fill(studentPassword);
  await studentPage.locator('#register-form button[type="submit"]').click();

  await studentPage.waitForSelector('#alert-placeholder .alert-success', { timeout: 10000 });
  await expect(studentPage.locator('#alert-placeholder .alert-success')).toContainText(
    'Registration successful.'
  );

  // After registration, the page redirects back to studentUrl (task list page) after a short delay. Wait for it to fully load.
  await studentPage.waitForURL(studentUrl, { timeout: 10000 });
  await studentPage.waitForSelector('#login-form', { timeout: 10000 });

  // Start listening for the login API response BEFORE triggering the login
  const loginResponsePromise = studentPage.waitForResponse(
    r => r.url().includes('/api/student_login')
  );

  // Fill in the login form in navbar and submit
  await studentPage.locator('#login-form #username').fill(studentUsername);
  await studentPage.locator('#login-form #password').fill(studentPassword);
  await studentPage.locator('#login-btn').click();

  // Assert login API returned success before waiting for navigation
  const loginResponse = await loginResponsePromise;
  expect(loginResponse.status()).toBe(200);

  // After successful login, expect redirect to /tasks
  await studentPage.waitForURL(studentUrl + '/tasks', { timeout: 15000 });
  await expect(studentPage).toHaveURL(studentUrl + '/tasks');
});
// @ts-check
import { test, expect } from '@playwright/test';
import {
  registerTeacher,
  loginTeacher,
  createTaskSetWithTasks,
  registerStudent,
  loginStudent,
  getStudentUrl,
} from './test-helpers.js';

test('student can open and submit a (empty) task from the task set', async ({ page, browser }) => {
  const unique = Date.now();
  const teacherUsername = `teacher_st_${unique}`;
  const teacherEmail = `teacher_st_${unique}@example.com`;
  const teacherPassword = 'password123';
  const taskSetTitle = `Student Task Set ${unique}`;

  // Teacher registers, logs in, and creates a task set with specific tasks
  await registerTeacher(page, teacherUsername, teacherEmail, teacherPassword);
  await page.waitForSelector('#alert-placeholder .alert-success', { timeout: 10000 });

  await loginTeacher(page, teacherUsername, teacherPassword);
  await expect(page).toHaveURL(/\/teacher-dashboard$/);

  await createTaskSetWithTasks(
    page,
    taskSetTitle,
    `Student description for ${taskSetTitle}`,
    `Teacher description for ${taskSetTitle}`,
    ['add_in_range', 'greater_num']
  );
  await page.waitForURL(/\/teacher-dashboard$/, { timeout: 10000 });

  // Get the student-facing URL
  const studentUrl = await getStudentUrl(page, taskSetTitle);

  // Open a new browser context for the student
  const studentContext = await browser.newContext();
  const studentPage = await studentContext.newPage();
  await studentPage.goto(studentUrl);

  // Register and login as student (username must be ≤20 chars due to HTML maxlength)
  const studentUsername = `st_${unique}`;
  const studentEmail = `student_${unique}@example.com`;

  await registerStudent(studentPage, studentUsername, studentEmail);
  await studentPage.waitForSelector('#alert-placeholder .alert-success', { timeout: 10000 });

  await studentPage.waitForURL(studentUrl, { timeout: 10000 });
  await studentPage.waitForSelector('#login-form', { timeout: 10000 });

  // Start listening for the login API response BEFORE triggering the login
  const loginResponsePromise = studentPage.waitForResponse(
    r => r.url().includes('/api/student_login')
  );

  await loginStudent(studentPage, studentUsername);

  // Assert login API returned success before waiting for navigation
  const loginResponse = await loginResponsePromise;
  expect(loginResponse.status()).toBe(200);

  await studentPage.waitForURL(studentUrl + '/tasks', { timeout: 15000 });

  // Click on the "add_in_range" task
  await studentPage.locator('.task-set-item', { hasText: 'add_in_range' }).click();

  // Click "Start" on the start page
  await studentPage.waitForSelector('#start-btn', { timeout: 10000 });
  await studentPage.locator('#start-btn').click();

  // Wait for the Parsons problem page to load with the Run Tests button
  await studentPage.waitForSelector('.btn.btn-primary:not([disabled])', { timeout: 30000 });

  // Click "Run Tests" to submit the task
  await studentPage.getByRole('button', { name: 'Run Tests' }).click();

  // Verify test results appear
  await studentPage.waitForSelector('test-results-element', { timeout: 30000 });
  await expect(studentPage.locator('test-results-element')).toBeVisible();

  await studentContext.close();
});

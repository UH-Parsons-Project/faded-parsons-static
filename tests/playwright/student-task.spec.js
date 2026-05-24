// @ts-check
import { test, expect } from '@playwright/test';
import {
  registerTeacher,
  loginTeacher,
  createTaskSetWithTasks,
  registerStudent,
  loginStudent,
  getStudentUrl,
  submitTaskWrongThenCorrect,
} from './test-helpers.js';

test('student can open and submit a task first incorrectly and then correctly from the task set', async ({ page, browser }) => {
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

  // Use helper: submit wrong solution first, then correct and assert pass
  await submitTaskWrongThenCorrect(studentPage);

  await studentContext.close();
});

test('student can navigate back to task list and see in-progress status', async ({ page, browser }) => {
  const unique = Date.now();
  const teacherUsername = `teacher_list_${unique}`;
  const teacherEmail = `teacher_list_${unique}@example.com`;
  const teacherPassword = 'password123';
  const taskSetTitle = `Task List Test ${unique}`;

  // Teacher registers
  await registerTeacher(page, teacherUsername, teacherEmail, teacherPassword);
  await page.waitForSelector('#alert-placeholder .alert-success', { timeout: 10000 });

  // Teacher logs in
  await loginTeacher(page, teacherUsername, teacherPassword);
  await expect(page).toHaveURL(/\/teacher-dashboard$/);

  // Teacher creates a task set with tasks
  await createTaskSetWithTasks(
    page,
    taskSetTitle,
    `Task List Description for ${taskSetTitle}`,
    `Teacher Description for ${taskSetTitle}`,
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

  const loginResponse = await loginResponsePromise;
  expect(loginResponse.status()).toBe(200);

  // Verify student is redirected to task list
  await studentPage.waitForURL(studentUrl + '/tasks', { timeout: 15000 });

  // Verify task list is displayed with tasks
  await expect(studentPage.locator('.task-set-item')).toHaveCount(3); // 2 tasks created (add_in_range, greater_num) + demo task
  await expect(studentPage.locator('.task-set-item', { hasText: 'add_in_range' })).toBeVisible();
  await expect(studentPage.locator('.task-set-item', { hasText: 'greater_num' })).toBeVisible();

  // Click on the "add_in_range" task
  await studentPage.locator('.task-set-item', { hasText: 'add_in_range' }).click();

  // Verify task page loads with "Start" button
  await studentPage.waitForSelector('#start-btn', { timeout: 10000 });
  await expect(studentPage.locator('#start-btn')).toBeVisible();

  // Click "Start" on the start page
  await studentPage.locator('#start-btn').click();

  // Wait for Parsons problem page to load
  await studentPage.waitForSelector('.btn.btn-primary:not([disabled])', { timeout: 30000 });

  // Navigate back to task list
  await studentPage.goBack();
  await studentPage.waitForURL(studentUrl + '/tasks', { timeout: 15000 });

  // Verify "add_in_range" task now shows "in progress" status
  const addInRangeTask = studentPage.locator('.task-set-item', { hasText: 'add_in_range' });
  await expect(addInRangeTask).toBeVisible();
  await expect(addInRangeTask.locator('text=in progress')).toBeVisible();

  await studentContext.close();
});

// @ts-check
import { test, expect } from '@playwright/test';
import { registerTeacher, loginTeacher, createTaskSet } from './test-helpers.js';

test('teacher can create a new task set by clicking "Create New Task Set"', async ({ page }) => {
  const unique = Date.now();
  const username = `teacher_${unique}`;
  const email = `teacher_${unique}@example.com`;
  const password = 'password123';
  const taskSetTitle = `Test Task Set ${unique}`;
  const studentDescription = `Student description for ${taskSetTitle}.`;
  const teacherDescription = `Teacher description for ${taskSetTitle}.`;

  // Register and login as a teacher
  await registerTeacher(page, username, email, password);
  await page.waitForSelector('#alert-placeholder .alert-success', { timeout: 10000 });

  await loginTeacher(page, username, password);
  await expect(page).toHaveURL(/\/teacher-dashboard$/);

  // Create a new task set
  await createTaskSet(page, taskSetTitle, studentDescription, teacherDescription);

  // Wait for redirect back to task set selector
  await page.waitForURL(/\/teacher-dashboard$/, { timeout: 10000 });
  await expect(page).toHaveURL(/\/teacher-dashboard$/);

  // Verify the newly created task set is visible on the page
  await expect(page.locator('.task-set-title', { hasText: taskSetTitle })).toBeVisible();
});

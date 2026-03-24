// @ts-check
import { test, expect } from '@playwright/test';
import { registerTeacher, loginTeacher, createTaskList } from './test-helpers.js';

test('teacher can create a new task list by clicking "Create New Task List"', async ({ page }) => {
  const unique = Date.now();
  const username = `teacher_${unique}`;
  const email = `teacher_${unique}@example.com`;
  const password = 'password123';
  const taskListTitle = `Test Task List ${unique}`;
  const studentDescription = `Student description for ${taskListTitle}.`;
  const teacherDescription = `Teacher description for ${taskListTitle}.`;

  // Register and login as a teacher
  await registerTeacher(page, username, email, password);
  await page.waitForSelector('#alert-placeholder .alert-success', { timeout: 10000 });

  await loginTeacher(page, username, password);
  await expect(page).toHaveURL(/\/task_list_selector$/);

  // Create a new task list
  await createTaskList(page, taskListTitle, studentDescription, teacherDescription);

  // Wait for redirect back to task list selector
  await page.waitForURL(/\/task_list_selector$/, { timeout: 10000 });
  await expect(page).toHaveURL(/\/task_list_selector$/);

  // Verify the newly created task list is visible on the page
  await expect(page.locator('.task-list-title', { hasText: taskListTitle })).toBeVisible();
});


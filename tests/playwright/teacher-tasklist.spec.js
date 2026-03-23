// @ts-check
import { test, expect } from '@playwright/test';
import { registerTeacher, loginTeacher } from './test-helpers.js';

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

  // Click on "Create New Task List" button
  await page.locator('text=Create New Task List').click();
  await expect(page).toHaveURL(/\/create_task_list$/);

  // Fill in the task list title
  await page.locator('#task-list-title').fill(taskListTitle);

  // Fill in student and teacher descriptions
  await page.locator('#student-description').fill(studentDescription);
  await page.locator('#teacher-description').fill(teacherDescription);

  // Wait for tasks to load and select three random tasks
  await page.waitForSelector('.task-item', { timeout: 10000 });
  const taskItems = await page.locator('.task-item').all();

  // Select 3 random tasks (or fewer if not enough tasks available)
  const tasksToSelect = Math.min(3, taskItems.length);
  const selectedIndices = new Set();

  while (selectedIndices.size < tasksToSelect) {
    selectedIndices.add(Math.floor(Math.random() * taskItems.length));
  }

  for (const index of selectedIndices) {
    await taskItems[index].click();
    await expect(taskItems[index]).toHaveClass(/selected/);
  }

  // Submit the form
  await page.locator('#create-task-list-form button[type="submit"]').click();

  // Wait for success message or redirect back to task list selector
  await page.waitForURL(/\/task_list_selector$/, { timeout: 10000 });
  await expect(page).toHaveURL(/\/task_list_selector$/);
});


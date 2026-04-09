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

test('teacher can add a new task', async ({ page }) => {
  const unique = Date.now();
  const username = `teacher_${unique}`;
  const email = `teacher_${unique}@example.com`;
  const password = 'password123';

  // Register and login as a teacher
  await registerTeacher(page, username, email, password);
  await page.waitForSelector('#alert-placeholder .alert-success', { timeout: 10000 });

  await loginTeacher(page, username, password);
  await expect(page).toHaveURL(/\/teacher-dashboard$/);

  // Click the "New task" button
  await page.locator('a.btn-success', { hasText: 'New task' }).click();

  // Verify we are on the create task page
  await page.waitForURL(/\/create-task$/, { timeout: 10000 });
  await expect(page).toHaveURL(/\/create-task$/);

  // Verify create task page elements are visible
  await expect(page.locator('.page-title')).toHaveText('Create a New Task');
  await expect(page.locator('#task-code')).toBeVisible();
  await expect(page.locator('#task-tests')).toBeVisible();
  await expect(page.locator('#submit-task')).toBeVisible();

  // Fill in task code
  await page.locator('#task-code').fill('def format_name(first, last):\n    return f"{first.strip().title()} {last.strip().title()}"');

  // Fill in task tests
  await page.locator('#task-tests').fill("assert format_name('ada', 'lovelace') == 'Ada Lovelace'\nassert format_name('  linus', 'torvalds ') == 'Linus Torvalds'");

  // Pre-set the Parsons block representation in sessionStorage so the editor
  // initializes with correct indent levels (the widget uses indent as levels,
  // not character counts, so we use #Ngiven format)
  const taskCode = 'def format_name(first, last):\n    return f"{first.strip().title()} {last.strip().title()}"';
  const blocksRepr = 'def format_name(first, last): #0given\nreturn f"{first.strip().title()} {last.strip().title()}" #1given';
  await page.evaluate(({ taskCode, blocksRepr }) => {
    sessionStorage.setItem('create_task_builder_blocks', blocksRepr);
    sessionStorage.setItem('create_task_builder_blocks_source', taskCode);
  }, { taskCode, blocksRepr });

  // Click "Continue To Block Builder"
  await page.locator('#submit-task').click();

  // Verify redirect to block builder editor
  await page.waitForURL(/\/create-task-editor/, { timeout: 10000 });
  await expect(page).toHaveURL(/\/create-task-editor/);

  // Fill in problem statement fields
  await page.locator('#task-title').fill('format_name_test');
  await page.locator('#problem-description').fill('format_name takes a first name and last name, strips whitespace, and returns them title-cased. It should take first and last as inputs and return the formatted full name.');
  await page.locator('#start-description').fill('In this exercise you will practice string formatting with strip and title methods.');

  // Verify blocks are already in the solution area (loaded from cached repr)
  await page.waitForSelector('#solution-sortable ul li', { timeout: 10000 });
  await expect(page.locator('#solution-sortable ul li')).toHaveCount(2);

  // Fill in tests
  await page.locator('#tests-input').fill("assert format_name('ada', 'lovelace') == 'Ada Lovelace'\nassert format_name('  linus', 'torvalds ') == 'Linus Torvalds'");

  // Click "Run Tests" and verify all tests passed
  await page.locator('#run-tests').click();
  await expect(page.locator('#test-results')).toContainText('All tests passed!', { timeout: 30000 });

  // Click "Set as Model Answer" / "Update Model Answer" and verify status
  await page.locator('#set-model-answer').click();
  await expect(page.locator('#model-answer-status')).toContainText('Model answer saved at', { timeout: 10000 });

  // Click "Preview" and verify the preview modal appears
  await page.locator('#preview-student-view').click();
  await expect(page.locator('#student-preview-modal')).toBeVisible();

  // Close the preview modal
  await page.locator('#close-student-preview').click();
  await expect(page.locator('#student-preview-modal')).toBeHidden();

  // Click "Add to Problem List" — accept the success/failure alert dialog
  page.on('dialog', dialog => dialog.accept());
  await page.locator('#add-to-problem-list').click();

  // Verify redirect to teacher dashboard after successful submission
  await page.waitForURL(/\/teacher-dashboard$/, { timeout: 15000 });
});


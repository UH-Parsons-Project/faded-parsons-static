// @ts-check
import { test, expect } from '@playwright/test';
import { registerTeacher, loginTeacher, getStudentUrl } from './test-helpers.js';

test.describe('Task Set Creation Validation & Features', () => {
  test('does not allow creating a task set if the name is left empty', async ({ page }) => {
    const unique = Date.now();
    const teacherUsername = `teacher_empty_${unique}`;
    const teacherEmail = `teacher_empty_${unique}@example.com`;
    const teacherPassword = 'password123';

    // 1. Register and login teacher
    await registerTeacher(page, teacherUsername, teacherEmail, teacherPassword);
    await page.waitForSelector('#alert-placeholder .alert-success', { timeout: 10000 });
    await loginTeacher(page, teacherUsername, teacherPassword);
    await page.waitForURL(/\/teacher-dashboard$/, { timeout: 10000 });

    // 2. Go to create task set page
    await page.goto('/create-task-set');
    await page.waitForURL(/\/create-task-set$/, { timeout: 10000 });

    // 3. Ensure title field is left empty
    await page.locator('#task-set-title').fill('');

    // 4. Attempt to submit the form
    await page.locator('#create-task-set-form button[type="submit"]').click();

    // 5. Verify HTML5 validation marks title input as invalid and form is not submitted
    const titleInput = page.locator('#task-set-title');
    const isInvalid = await titleInput.evaluate((el) => !/** @type {HTMLInputElement} */ (el).checkValidity());
    expect(isInvalid).toBe(true);

    // Verify page remains on creation view and does not navigate
    expect(page.url()).toContain('/create-task-set');
  });

  test('does not allow creating a task set with a title shorter than 4 characters (e.g. "abc")', async ({ page }) => {
    const unique = Date.now();
    const teacherUsername = `teacher_short_${unique}`;
    const teacherEmail = `teacher_short_${unique}@example.com`;
    const teacherPassword = 'password123';

    // 1. Register and login teacher
    await registerTeacher(page, teacherUsername, teacherEmail, teacherPassword);
    await page.waitForSelector('#alert-placeholder .alert-success', { timeout: 10000 });
    await loginTeacher(page, teacherUsername, teacherPassword);
    await page.waitForURL(/\/teacher-dashboard$/, { timeout: 10000 });

    // 2. Go to create task set page
    await page.goto('/create-task-set');
    await page.waitForURL(/\/create-task-set$/, { timeout: 10000 });

    // 3. Fill short title ("abc")
    await page.locator('#task-set-title').fill('abc');

    // 4. Attempt to submit the form
    await page.locator('#create-task-set-form button[type="submit"]').click();

    // 5. Verify validation rejects titles under 4 characters and form is not submitted
    const titleInput = page.locator('#task-set-title');
    const isTooShort = await titleInput.evaluate((el) => {
      const input = /** @type {HTMLInputElement} */ (el);
      return !input.checkValidity() || input.validity.tooShort;
    });
    expect(isTooShort).toBe(true);

    // Verify page remains on creation view and does not navigate
    expect(page.url()).toContain('/create-task-set');
  });

  test('opens task preview modal and displays correct tasks problem statement', async ({ page }) => {
    const unique = Date.now();
    const teacherUsername = `teacher_prev_${unique}`;
    const teacherEmail = `teacher_prev_${unique}@example.com`;
    const teacherPassword = 'password123';

    // 1. Register and login teacher
    await registerTeacher(page, teacherUsername, teacherEmail, teacherPassword);
    await page.waitForSelector('#alert-placeholder .alert-success', { timeout: 10000 });
    await loginTeacher(page, teacherUsername, teacherPassword);
    await page.waitForURL(/\/teacher-dashboard$/, { timeout: 10000 });

    // 2. Go to create task set page
    await page.goto('/create-task-set');
    await page.waitForURL(/\/create-task-set$/, { timeout: 10000 });

    // 3. Wait for tasks list to load in task selector
    await page.waitForSelector('.task-item', { timeout: 10000 });
    const firstTask = page.locator('.task-item').first();
    const expectedTaskTitle = (await firstTask.locator('.task-item-title').textContent())?.trim();

    // 4. Click the task preview button
    await firstTask.locator('.preview-btn').click();

    // 5. Verify the task preview modal opens and displays title & problem statement
    const previewModal = page.locator('#student-preview-modal');
    await expect(previewModal).toHaveClass(/open/, { timeout: 10000 });

    const previewTitle = page.locator('#preview-task-title');
    await expect(previewTitle).toHaveText(expectedTaskTitle || '');

    const problemStatement = page.locator('#preview-problem-text');
    await expect(problemStatement).not.toBeEmpty();
  });

  test('filters available tasks when searching in the search box', async ({ page }) => {
    const unique = Date.now();
    const teacherUsername = `teacher_search_${unique}`;
    const teacherEmail = `teacher_search_${unique}@example.com`;
    const teacherPassword = 'password123';

    // 1. Register and login teacher
    await registerTeacher(page, teacherUsername, teacherEmail, teacherPassword);
    await page.waitForSelector('#alert-placeholder .alert-success', { timeout: 10000 });
    await loginTeacher(page, teacherUsername, teacherPassword);
    await page.waitForURL(/\/teacher-dashboard$/, { timeout: 10000 });

    // 2. Go to create task set page
    await page.goto('/create-task-set');
    await page.waitForURL(/\/create-task-set$/, { timeout: 10000 });

    // 3. Wait for available tasks to load
    await page.waitForSelector('.task-item', { timeout: 10000 });
    const initialCount = await page.locator('.task-item').count();
    expect(initialCount).toBeGreaterThan(0);

    const firstTaskTitle = (await page.locator('.task-item .task-item-title').first().textContent())?.trim() || '';
    expect(firstTaskTitle).not.toBe('');

    // 4. Open task filter panel and enter search query
    await page.locator('.task-filter-toggle').click();
    await page.locator('#task-search').fill(firstTaskTitle);

    // 5. Verify task list is filtered to matching tasks
    const matchingCount = await page.locator('.task-item').count();
    expect(matchingCount).toBeGreaterThan(0);
    expect(matchingCount).toBeLessThanOrEqual(initialCount);

    const filteredTitles = await page.locator('.task-item .task-item-title').allTextContents();
    for (const title of filteredTitles) {
      expect(title.toLowerCase()).toContain(firstTaskTitle.toLowerCase());
    }

    // 6. Search for non-existent task title
    await page.locator('#task-search').fill('nonexistent_search_query_999xyz');
    await expect(page.locator('.task-item')).toHaveCount(0);
    await expect(page.locator('#task-selector')).toContainText('No tasks available');
  });

  test('handles teacher sharing with valid email and shows correct error for invalid inputs', async ({ page }) => {
    const unique = Date.now();
    const password = 'password123';

    // 1. Create another teacher to share with
    const otherUsername = `other_teacher_${unique}`;
    const otherEmail = `other_teacher_${unique}@example.com`;
    await registerTeacher(page, otherUsername, otherEmail, password);
    await page.waitForSelector('#alert-placeholder .alert-success', { timeout: 10000 });

    // 2. Register and login main teacher
    const mainUsername = `main_teacher_${unique}`;
    const mainEmail = `main_teacher_${unique}@example.com`;
    await registerTeacher(page, mainUsername, mainEmail, password);
    await page.waitForSelector('#alert-placeholder .alert-success', { timeout: 10000 });
    await loginTeacher(page, mainUsername, password);
    await page.waitForURL(/\/teacher-dashboard$/, { timeout: 10000 });

    // 3. Go to create task set page
    await page.goto('/create-task-set');
    await page.waitForURL(/\/create-task-set$/, { timeout: 10000 });

    const viewerInput = page.locator('#viewer-identifiers');
    const addViewerBtn = page.locator('#add-viewer-btn');
    const viewerErrors = page.locator('#viewer-errors');
    const viewerList = page.locator('#viewer-list');

    // 4. Test error for non-existent teacher email
    await viewerInput.fill('nonexistent_teacher_xyz999@example.com');
    await addViewerBtn.click();
    await expect(viewerErrors).toContainText('Teacher not found', { timeout: 10000 });

    // 5. Test error for adding self as viewer
    await viewerInput.fill(mainEmail);
    await addViewerBtn.click();
    await expect(viewerErrors).toContainText('You cannot add yourself as a viewer', { timeout: 10000 });

    // 6. Test successfully adding valid teacher by email
    await viewerInput.fill(otherEmail);
    await addViewerBtn.click();
    await expect(viewerList).toContainText(otherUsername, { timeout: 10000 });
    await expect(viewerList).toContainText(otherEmail);
  });

  test('creates a task set with expiration date and verifies student access is closed after expiry', async ({ page }) => {
    test.slow();

    const unique = Date.now();
    const teacherUsername = `teacher_exp_${unique}`;
    const teacherEmail = `teacher_exp_${unique}@example.com`;
    const teacherPassword = 'password123';
    const taskSetTitle = `Expired Task Set ${unique}`;

    // 1. Register and login teacher
    await registerTeacher(page, teacherUsername, teacherEmail, teacherPassword);
    await page.waitForSelector('#alert-placeholder .alert-success', { timeout: 10000 });
    await loginTeacher(page, teacherUsername, teacherPassword);
    await page.waitForURL(/\/teacher-dashboard$/, { timeout: 10000 });

    // 2. Go to create task set page
    await page.goto('/create-task-set');
    await page.waitForURL(/\/create-task-set$/, { timeout: 10000 });

    // 3. Fill form: title & select task
    await page.locator('#task-set-title').fill(taskSetTitle);
    await page.waitForSelector('.task-item', { timeout: 10000 });
    await page.locator('.task-item').first().click();

    // 4. Set expiration date in the past.
    // The UI exposes a direct datetime-local field (no separate enable checkbox).
    await page.locator('#expiration-date').fill('2020-01-01T12:00');

    // 5. Submit form
    await page.locator('#create-task-set-form button[type="submit"]').click();

    // 6. Wait for redirect to teacher dashboard (accounting for JS setTimeout redirect)
    await page.waitForURL(/\/teacher-dashboard$/, { timeout: 15000 });

    // 7. Get student URL from dashboard and navigate to it
    const studentUrl = await getStudentUrl(page, taskSetTitle);
    await page.goto(studentUrl);

    // 8. Verify student page displays task set not open page
    await expect(page.locator('body')).toContainText('This task set is not open', { timeout: 10000 });
  });
});

// @ts-check
import { test, expect } from '@playwright/test';
import { loginTeacher, createTestStudent } from './test-helpers.js';

test.beforeEach(async ({ page }) => {
  // Login as seeded admin user
  await loginTeacher(page, 'mattiruotsalainen', 'test1234');
  await expect(page).toHaveURL(/\/teacher-dashboard$/);

  // Register one student so "Registered Students" stat is non-zero
  const unique = Date.now() % 1000000;
  const studentUsername = `student_${unique}`;
  const studentEmail = `student_${unique}@example.com`;
  const resp = await createTestStudent(page, studentUsername, studentEmail, 'password123');
  if (!resp.ok()) {
    console.warn('Student registration in beforeEach returned', resp.status());
  }
});

test('admin dashboard shows stats and can create a registration token', async ({ page }) => {

  // Open admin dashboard
  await page.goto('/admin-dashboard');

  // Basic stats elements should be visible
  await page.waitForSelector('#stat-registered-students', { timeout: 10000 });
  await expect(page.locator('#stat-registered-students')).toBeVisible();
  // Registered teachers stat should be visible as well
  await page.waitForSelector('#stat-registered-teachers', { timeout: 10000 });
  await expect(page.locator('#stat-registered-teachers')).toBeVisible();
  await expect(page.locator('#stat-total-lists')).toBeVisible();

  // Token management UI should be present
  await expect(page.locator('#generate-token-btn')).toBeVisible();
  await expect(page.locator('#add-token-btn')).toBeVisible();
  await expect(page.locator('#token-input')).toBeVisible();

  // Generate a token and ensure input receives a value
  await page.locator('#generate-token-btn').click();
  const generated = await page.locator('#token-input').inputValue();
  expect(generated.length).toBeGreaterThan(0);

  // Add the token and verify the token display appears with a value
  await Promise.all([
    page.waitForSelector('#token-display', { timeout: 10000 }),
    page.locator('#add-token-btn').click(),
  ]);

  await expect(page.locator('#token-value')).toBeVisible();
  const displayed = (await page.locator('#token-value').textContent()) || '';
  expect(displayed.trim().length).toBeGreaterThan(0);

  // Tokens list should contain at least one token entry after creation
  await page.waitForSelector('#tokens-list .token-item', { timeout: 10000 });
  const tokenItems = await page.locator('#tokens-list .token-item').count();
  expect(tokenItems).toBeGreaterThan(0);

  // Verify admin dashboard shows counts: registered students, registered teachers and total task sets
  const studentsText = (await page.locator('#stat-registered-students').textContent()) || '';
  const teachersText = (await page.locator('#stat-registered-teachers').textContent()) || '';
  const listsText = (await page.locator('#stat-total-lists').textContent()) || '';

  /** @param {string} s */
  const parseNumber = (s) => {
    const m = s.replace(/[^0-9]/g, '');
    return m ? parseInt(m, 10) : 0;
  };

  expect(parseNumber(studentsText)).toBeGreaterThan(0);
  expect(parseNumber(teachersText)).toBeGreaterThan(0);
  expect(parseNumber(listsText)).toBeGreaterThan(0);
});

test('admin can add, edit and deactivate a task type tag', async ({ page }) => {
  await page.goto('/admin-dashboard');
  await page.waitForSelector('#task-types-list .task-tag-row', { timeout: 10000 });

  const unique = Date.now();
  const label = `E2E Task Tag ${unique}`;

  await page.getByRole('button', { name: '+ Add tag' }).click();
  await expect(page.getByRole('dialog', { name: 'Add tag' })).toBeVisible();
  await page.locator('#task-tag-name').fill(label);
  await page.getByRole('button', { name: 'Add tag', exact: true }).last().click();

  const row = page.locator('.task-tag-row').filter({ hasText: label });
  await expect(row).toBeVisible();
  await expect(row.locator('input')).toHaveCount(0);
  await expect(row.locator('.task-tag-status-badge')).toHaveText('Active');

  const updatedLabel = `${label} Updated`;
  await row.getByRole('button', { name: `More actions for ${label}` }).click();
  await page.getByRole('menuitem', { name: 'Edit tag' }).click();
  await expect(page.getByRole('dialog', { name: 'Edit tag' })).toBeVisible();
  await page.locator('#task-tag-name').fill(updatedLabel);
  await page.getByRole('button', { name: 'Save change' }).click();

  const updatedRow = page.locator('.task-tag-row').filter({ hasText: updatedLabel });
  await expect(updatedRow).toBeVisible();
  await updatedRow.getByRole('button', { name: `More actions for ${updatedLabel}` }).click();
  await page.getByRole('menuitem', { name: 'Deactivate tag' }).click();
  await expect(updatedRow.locator('.task-tag-status-badge')).toHaveText('Inactive');
});

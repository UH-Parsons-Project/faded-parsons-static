// @ts-check
import { test, expect } from '@playwright/test';
import { registerTeacher, loginTeacher } from './test-helpers.js';

test('teacher can register and then login from the main page', async ({ page }) => {
  const unique = Date.now();
  const username = `teacher_${unique}`;
  const email = `teacher_${unique}@example.com`;
  const password = 'password123';

  // Register a new teacher account
  await registerTeacher(page, username, email, password);

  await page.waitForSelector('#alert-placeholder .alert-success', { timeout: 10000 });
  await expect(page.locator('#alert-placeholder .alert-success')).toContainText(
    'Registration successful.'
  );

  // Login from the main page with the just-created credentials
  await loginTeacher(page, username, password);

  await expect(page).toHaveURL(/\/teacher-dashboard$/);
});

test('teacher can logout after successful login', async ({ page }) => {
  const unique = Date.now();
  const username = `teacher_logout_${unique}`;
  const email = `teacher_logout_${unique}@example.com`;
  const password = 'password123';

  await registerTeacher(page, username, email, password);
  await page.waitForSelector('#alert-placeholder .alert-success', { timeout: 10000 });
  await expect(page.locator('#alert-placeholder .alert-success')).toContainText(
    'Registration successful.'
  );

  await loginTeacher(page, username, password);
  await expect(page).toHaveURL(/\/teacher-dashboard$/);

  await page.locator('#logout-btn').click();
  await expect(page).toHaveURL(/\/index\.html$/);
  await expect(page.locator('#login-form')).toBeVisible();
});

test('registration shows error for duplicate username', async ({ page }) => {
  const unique = Date.now();
  const username = `teacher_dup_${unique}`;
  const email1 = `teacher_dup_${unique}@example.com`;
  const email2 = `teacher_dup_${unique}_2@example.com`;

  await registerTeacher(page, username, email1);
  await page.waitForSelector('#alert-placeholder .alert-success', { timeout: 10000 });
  await expect(page.locator('#alert-placeholder .alert-success')).toContainText(
    'Registration successful.'
  );

  await registerTeacher(page, username, email2);
  await page.waitForSelector('#alert-placeholder .alert-danger', { timeout: 10000 });
  await expect(page.locator('#alert-placeholder .alert-danger')).toContainText(
    'Username or email already exists'
  );
});

test('registration shows error for invalid token', async ({ page }) => {
  const unique = Date.now();
  const username = `teacher_badtoken_${unique}`;
  const email = `teacher_badtoken_${unique}@example.com`;

  await registerTeacher(page, username, email, 'password123', 'wrong_token');

  await expect(page.locator('#alert-placeholder .alert-danger')).toContainText(
    'Invalid registration token'
  );
});

test('login shows error with wrong password', async ({ page }) => {
  const unique = Date.now();
  const username = `teacher_wrongpw_${unique}`;
  const email = `teacher_wrongpw_${unique}@example.com`;
  const password = 'password123';

  await registerTeacher(page, username, email, password);
  await page.waitForSelector('#alert-placeholder .alert-success', { timeout: 10000 });
  await expect(page.locator('#alert-placeholder .alert-success')).toContainText(
    'Registration successful.'
  );

  await loginTeacher(page, username, 'wrong-password');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('#error-message')).toBeVisible();
  await expect(page.locator('#error-message')).toContainText('Incorrect username or password');
});

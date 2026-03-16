// @ts-check
import { test, expect } from '@playwright/test';

async function registerTeacher(
  page,
  username,
  email,
  password = 'password123',
  registrationToken = 'test_token'
) {
  await page.goto('/register');
  await page.locator('#username').fill(username);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#password_confirm').fill(password);
  await page.locator('#registration_token').fill(registrationToken);
  await page.locator('#register-form button[type="submit"]').click();
}

async function loginTeacher(page, username, password) {
  await page.goto('/');
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.locator('#login-btn').click();
}

test('teacher can register and then login from the main page', async ({ page }) => {
  const unique = Date.now();
  const username = `teacher_${unique}`;
  const email = `teacher_${unique}@example.com`;
  const password = 'password123';

  // Open main page and navigate to registration using the navbar button.
  await page.goto('/');
  await page.locator('#register-btn').click();
  await expect(page).toHaveURL(/\/register$/);

  // Register a new teacher account.
  await page.locator('#username').fill(username);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#password_confirm').fill(password);
  await page.locator('#registration_token').fill('test_token');
  await page.locator('#register-form button[type="submit"]').click();

  await expect(page.locator('#alert-placeholder .alert-success')).toContainText(
    'Registration successful.'
  );

  // Login from the main page with the just-created credentials.
  await page.goto('/');
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.locator('#login-btn').click();

  await expect(page).toHaveURL(/\/exerciselist$/);
});

test('teacher can logout after successful login', async ({ page }) => {
  const unique = Date.now();
  const username = `teacher_logout_${unique}`;
  const email = `teacher_logout_${unique}@example.com`;
  const password = 'password123';

  await registerTeacher(page, username, email, password);
  await expect(page.locator('#alert-placeholder .alert-success')).toContainText(
    'Registration successful.'
  );

  await loginTeacher(page, username, password);
  await expect(page).toHaveURL(/\/exerciselist$/);

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
  await expect(page.locator('#alert-placeholder .alert-success')).toContainText(
    'Registration successful.'
  );

  await registerTeacher(page, username, email2);
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

test('registration fails with wrong access token and user cannot login', async ({ page }) => {
  const unique = Date.now();
  const username = `teacher_wrong_access_${unique}`;
  const email = `teacher_wrong_access_${unique}@example.com`;
  const password = 'password123';

  await registerTeacher(page, username, email, password, 'wrong_access_token');
  await expect(page.locator('#alert-placeholder .alert-danger')).toContainText(
    'Invalid registration token'
  );

  await loginTeacher(page, username, password);
  await expect(page.locator('#error-message')).toContainText('Incorrect username or password');
});


test('login shows error with wrong password', async ({ page }) => {
  const unique = Date.now();
  const username = `teacher_wrongpw_${unique}`;
  const email = `teacher_wrongpw_${unique}@example.com`;
  const password = 'password123';

  await registerTeacher(page, username, email, password);
  await expect(page.locator('#alert-placeholder .alert-success')).toContainText(
    'Registration successful.'
  );

  await loginTeacher(page, username, 'wrong-password');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('#error-message')).toBeVisible();
  await expect(page.locator('#error-message')).toContainText('Incorrect username or password');
});

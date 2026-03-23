// @ts-check
/* eslint-env node */
/**
 * Shared test helper functions for Playwright tests
 */

const teacherRegistrationToken = process.env.TEACHER_REGISTRATION_TOKEN;

export async function registerTeacher(
  page,
  username,
  email,
  password = 'password123',
  registrationToken = teacherRegistrationToken
) {
  await page.goto('/register');
  await page.locator('#username').fill(username);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#password_confirm').fill(password);
  await page.locator('#registration_token').fill(registrationToken);
  await page.locator('#register-form button[type="submit"]').click();
}

export async function loginTeacher(page, username, password) {
  await page.goto('/');
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.locator('#login-btn').click();
}

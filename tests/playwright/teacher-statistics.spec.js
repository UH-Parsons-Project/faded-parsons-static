// @ts-check
import { test, expect } from '@playwright/test';
import {
  registerTeacher,
  loginTeacher,
  createTaskListWithTasks,
  registerStudent,
  loginStudent,
  getStudentUrl,
} from './test-helpers.js';

test('teacher can see empty student submission in task list statistics under "students"', async ({ page, browser }) => {
  const unique = Date.now();
  const teacherUsername = `teacher_stat_${unique}`;
  const teacherEmail = `teacher_stat_${unique}@example.com`;
  const teacherPassword = 'password123';
  const taskListTitle = `Stats Task List ${unique}`;

  // Teacher registers, logs in, and creates a task list with specific tasks
  await registerTeacher(page, teacherUsername, teacherEmail, teacherPassword);
  await page.waitForSelector('#alert-placeholder .alert-success', { timeout: 10000 });

  await loginTeacher(page, teacherUsername, teacherPassword);
  await expect(page).toHaveURL(/\/task_list_selector$/);

  await createTaskListWithTasks(
    page,
    taskListTitle,
    `Student description for ${taskListTitle}`,
    `Teacher description for ${taskListTitle}`,
    ['add_in_range', 'greater_num']
  );
  await page.waitForURL(/\/task_list_selector$/, { timeout: 10000 });

  // Get the student-facing URL
  const studentUrl = await getStudentUrl(page, taskListTitle);

  // Student registers, logs in, and submits a task
  const studentContext = await browser.newContext();
  const studentPage = await studentContext.newPage();
  await studentPage.goto(studentUrl);

  const studentUsername = `st_${unique % 1000000000}`;
  const studentEmail = `student_stat_${unique}@example.com`;

  await registerStudent(studentPage, studentUsername, studentEmail);
  await studentPage.waitForSelector('#alert-placeholder .alert-success', { timeout: 10000 });

  await studentPage.waitForURL(studentUrl, { timeout: 10000 });
  await studentPage.waitForSelector('#login-form', { timeout: 10000 });

  await loginStudent(studentPage, studentUsername);
  await studentPage.waitForURL(studentUrl + '/tasks', { timeout: 15000 });

  // Click on the "add_in_range" task
  await studentPage.locator('.task-list-item', { hasText: 'add_in_range' }).click();

  // Start the task
  await studentPage.waitForSelector('#start-btn', { timeout: 10000 });
  await studentPage.locator('#start-btn').click();

  // Wait for problem page and submit
  await studentPage.waitForSelector('.btn.btn-primary:not([disabled])', { timeout: 30000 });
  await studentPage.locator('.btn.btn-primary').click();

  // Wait for submission to complete
  await studentPage.waitForSelector('test-results-element', { timeout: 30000 });
  await studentContext.close();

  // Teacher navigates to task list statistics and checks for student submission
  await page.goto('/task_list_selector');
  await page.waitForSelector('.task-list-title', { timeout: 10000 });
  await page.locator('.task-list-title', { hasText: taskListTitle }).click();

  // Wait for the statistics page to load
  await page.waitForSelector('#students-list', { timeout: 10000 });

  // Verify the student appears in the students list
  await expect(page.locator('.student-item .student-name', { hasText: studentUsername })).toBeVisible({ timeout: 10000 });
});

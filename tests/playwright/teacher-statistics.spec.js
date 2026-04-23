// @ts-check
import { test, expect } from '@playwright/test';
import {
  registerTeacher,
  loginTeacher,
  createTaskSetWithTasks,
  registerStudent,
  loginStudent,
  getStudentUrl,
  submitTaskWrongThenCorrect,
} from './test-helpers.js';

test('teacher verifies attempts/success via teacher-dashboard -> task-set-overview, student_attempts, student_task_statistics, task-statistics and /api/tasks/*/statistics', async ({ page, browser }) => {
  const unique = Date.now();
  const teacherUsername = `teacher_stat_${unique}`;
  const teacherEmail = `teacher_stat_${unique}@example.com`;
  const teacherPassword = 'password123';
  const taskSetTitle = `Stats Task Set ${unique}`;

  // Teacher registers, logs in, and creates a task set with specific tasks
  await registerTeacher(page, teacherUsername, teacherEmail, teacherPassword);
  await page.waitForSelector('#alert-placeholder .alert-success', { timeout: 10000 });

  await loginTeacher(page, teacherUsername, teacherPassword);
  await expect(page).toHaveURL(/\/teacher-dashboard$/);

  await createTaskSetWithTasks(
    page,
    taskSetTitle,
    `Student description for ${taskSetTitle}`,
    `Teacher description for ${taskSetTitle}`,
    ['add_in_range', 'greater_num']
  );
  await page.waitForURL(/\/teacher-dashboard$/, { timeout: 10000 });

  // Get the student-facing URL
  const studentUrl = await getStudentUrl(page, taskSetTitle);

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
  await studentPage.locator('.task-set-item', { hasText: 'add_in_range' }).click();

  // Start the task
  await studentPage.waitForSelector('#start-btn', { timeout: 10000 });
  await studentPage.locator('#start-btn').click();

  // Use helper: submit a wrong solution first, then correct it
  await submitTaskWrongThenCorrect(studentPage);
  await studentContext.close();
  // Teacher navigates to task set statistics and checks for student submission
  await page.goto('/teacher-dashboard');
  await page.waitForSelector('.task-set-title', { timeout: 10000 });
  await page.locator('.task-set-title', { hasText: taskSetTitle }).click();
  await page.waitForURL(/\/task-set-overview\?/, { timeout: 10000 });
  const overviewUrl = page.url();
  const setId = new URL(overviewUrl).searchParams.get('set_id');

  // Wait for the statistics page to load and student to appear
  await page.waitForSelector('#students-list', { timeout: 10000 });
  await expect(page.locator('.student-item .student-name', { hasText: studentUsername })).toBeVisible({ timeout: 10000 });

  // Open the student's attempts view and verify attempts and success
  await page.locator('.student-item', { hasText: studentUsername }).click();
  await page.waitForSelector('#attempts-list', { timeout: 10000 });

  // Ensure there is at least one attempt entry
  const attemptsText = await page.locator('.sa-attempt-count').first().textContent();
  const attemptsNum = Number((attemptsText || '').replace(/[^0-9]/g, '')) || 0;
  expect(attemptsNum).toBeGreaterThanOrEqual(2);

  // Verify at least one success is shown for the task
  await expect(page.locator('.sa-status-label', { hasText: 'Success' })).toBeVisible({ timeout: 10000 });

  // Open the per-task student statistics and verify there is at least one failed and one successful attempt
  await page.locator('.task-set-item', { hasText: 'add_in_range' }).click();
  await page.waitForSelector('.attempt-item', { timeout: 10000 });

  const failureCount = await page.locator('.attempt-item.failure').count();
  const successCount = await page.locator('.attempt-item.success').count();

  expect(failureCount).toBeGreaterThanOrEqual(1);
  expect(successCount).toBeGreaterThanOrEqual(1);

  // --- Additional checks: verify aggregated task and global statistics report the attempt ---
  // Fetch tasks for this set to find the task id and task set code
  const tasksResp = await page.request.get(`/api/my_sets/${encodeURIComponent(setId)}/tasks`);
  expect(tasksResp.ok()).toBeTruthy();
  const tasks = await tasksResp.json();
  const task = tasks.find(t => t.title === 'add_in_range');
  expect(task).toBeTruthy();

  const taskId = task.id;

  // Get the task set code (unique_link_code) from the task set info
  const setInfoResp = await page.request.get(`/api/my_sets/${encodeURIComponent(setId)}`);
  expect(setInfoResp.ok()).toBeTruthy();
  const setInfo = await setInfoResp.json();
  const taskSetCode = setInfo.unique_link_code;

  // Call task-level statistics for this task within the task set
  const taskStatsResp = await page.request.get(`/api/tasks/${taskId}/statistics?task_set_code=${encodeURIComponent(taskSetCode)}`);
  expect(taskStatsResp.ok()).toBeTruthy();
  const taskStats = await taskStatsResp.json();
  expect(taskStats.total_completions).toBeGreaterThanOrEqual(1);

  // Call global task statistics (no task_set_code) and ensure totals include at least one completion
  const globalStatsResp = await page.request.get(`/api/tasks/${taskId}/statistics`);
  expect(globalStatsResp.ok()).toBeTruthy();
  const globalStats = await globalStatsResp.json();
  expect(globalStats.total_completions).toBeGreaterThanOrEqual(1);

  // --- Additional manual-check pages requested: visit specific URLs and assert displayed stats ---
  // 1) student_attempts for the created student and set -> ensure attempts > 0 and completed > 0
  await page.goto(`/student_attempts?student=${encodeURIComponent(studentUsername)}&set_id=${encodeURIComponent(setId)}`);
  await page.waitForSelector('#attempts-list, #sa-value-completed', { timeout: 10000 });

  // Parse completed count from the completion panel
  const completedText = await page.locator('#sa-value-completed').textContent().catch(() => null);
  const completedNum = Number((completedText || '').replace(/[^0-9]/g, '')) || 0;

  // Count attempted tasks listed
  const attemptedCount = await page.locator('#attempts-list .task-set-item').count().catch(() => 0);

  expect(attemptedCount).toBeGreaterThan(0);
  expect(completedNum).toBeGreaterThan(0);

  // 2) task-statistics for the created task -> ensure total attempts/completions visible and > 0
  await page.goto(`/task-statistics?id=${encodeURIComponent(taskId)}`);
  await page.waitForSelector('#total-completions, #students-completed-num', { timeout: 10000 });

  const totalCompletionsText = await page.locator('#total-completions').textContent().catch(() => null);
  const totalCompletions = Number((totalCompletionsText || '').replace(/[^0-9]/g, '')) || 0;

  const studentsCompletedText = await page.locator('#students-completed-num').textContent().catch(() => null);
  const studentsCompleted = Number((studentsCompletedText || '').replace(/[^0-9]/g, '')) || 0;

  expect(totalCompletions).toBeGreaterThan(0);
  expect(studentsCompleted).toBeGreaterThan(0);
});

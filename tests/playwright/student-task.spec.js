// @ts-check
import { test, expect } from '@playwright/test';
import {
  registerTeacher,
  loginTeacher,
  createTaskSetWithTasks,
  registerStudent,
  loginStudent,
  getStudentUrl,
} from './test-helpers.js';

test('student can open and submit a task first incorrectly and then correctly from the task set', async ({ page, browser }) => {
  const unique = Date.now();
  const teacherUsername = `teacher_st_${unique}`;
  const teacherEmail = `teacher_st_${unique}@example.com`;
  const teacherPassword = 'password123';
  const taskSetTitle = `Student Task Set ${unique}`;

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

  // Open a new browser context for the student
  const studentContext = await browser.newContext();
  const studentPage = await studentContext.newPage();
  await studentPage.goto(studentUrl);

  // Register and login as student (username must be ≤20 chars due to HTML maxlength)
  const studentUsername = `st_${unique}`;
  const studentEmail = `student_${unique}@example.com`;

  await registerStudent(studentPage, studentUsername, studentEmail);
  await studentPage.waitForSelector('#alert-placeholder .alert-success', { timeout: 10000 });

  await studentPage.waitForURL(studentUrl, { timeout: 10000 });
  await studentPage.waitForSelector('#login-form', { timeout: 10000 });

  // Start listening for the login API response BEFORE triggering the login
  const loginResponsePromise = studentPage.waitForResponse(
    r => r.url().includes('/api/student_login')
  );

  await loginStudent(studentPage, studentUsername);

  // Assert login API returned success before waiting for navigation
  const loginResponse = await loginResponsePromise;
  expect(loginResponse.status()).toBe(200);

  await studentPage.waitForURL(studentUrl + '/tasks', { timeout: 15000 });

  // Click on the "add_in_range" task
  await studentPage.locator('.task-set-item', { hasText: 'add_in_range' }).click();

  // Click "Start" on the start page
  await studentPage.waitForSelector('#start-btn', { timeout: 10000 });
  await studentPage.locator('#start-btn').click();

  // Wait for the Parsons problem page to load with the Run Tests button
  await studentPage.waitForSelector('.btn.btn-primary:not([disabled])', { timeout: 30000 });

  // --- Phase 1: submit an intentionally WRONG solution so tests fail ---
  await studentPage.evaluate(() => {
    const pe = document.querySelector('problem-element');
    const widget = pe.parsonsWidget;
    if (!widget) return;
    const findId = (substr) => {
      const l = widget.modified_lines.find(x => x.code && x.code.includes(substr));
      return l ? l.id : null;
    };

    const ordered = [
      findId('def add_in_range'),
      findId('total ='),
      findId('while'),
      findId('total +='),
      findId('start +='),
      findId('return total'),
    ].filter(Boolean);

    // Put the chosen lines into the solution area
    widget.createHTMLFromLists(ordered, widget.modified_lines.map(l => l.id).filter(id => !ordered.includes(id)));
    ordered.forEach(id => widget.updateHTMLIndent(id));

    // Fill blanks with an incorrect value (total = 1 instead of 0)
    const totalId = findId('total =');
    if (totalId) {
      const li = document.getElementById(totalId);
      const inp = li?.querySelector('input.text-box');
      if (inp) inp.value = '1';
    }
  });

  // Run tests and assert they do NOT fully pass
  await studentPage.getByRole('button', { name: 'Run Tests' }).click();
  await studentPage.waitForSelector('test-results-element', { timeout: 30000 });
  await expect(studentPage.locator('.test-result-summary.full-pass')).toHaveCount(0);

  // --- Phase 2: correct the solution so tests pass ---
  await studentPage.evaluate(() => {
    const pe = document.querySelector('problem-element');
    const widget = pe.parsonsWidget;
    if (!widget) return;
    const findId = (substr) => {
      const l = widget.modified_lines.find(x => x.code && x.code.includes(substr));
      return l ? l.id : null;
    };

    // Desired order and indent levels for a correct add_in_range solution
    const ordered = [
      findId('def add_in_range'), // def
      findId('total ='), // total = !BLANK
      findId('while'), // while !BLANK <= !BLANK:
      findId('total +='), // total += !BLANK
      findId('start +='), // start += !BLANK
      findId('return total'), // return total
    ].filter(Boolean);

    // Set logical indent numbers on model lines before rendering HTML
    const indentMap = {};
    if (ordered[0]) indentMap[ordered[0]] = 0; // def
    if (ordered[1]) indentMap[ordered[1]] = 1; // total
    if (ordered[2]) indentMap[ordered[2]] = 1; // while
    if (ordered[3]) indentMap[ordered[3]] = 2; // total += inside while
    if (ordered[4]) indentMap[ordered[4]] = 2; // start += inside while
    if (ordered[5]) indentMap[ordered[5]] = 1; // return

    Object.entries(indentMap).forEach(([id, val]) => {
      const line = widget.getLineById(id);
      if (line) line.indent = val;
    });

    // Render the chosen order into the solution column
    widget.createHTMLFromLists(ordered, widget.modified_lines.map(l => l.id).filter(id => !ordered.includes(id)));

    // Apply visual indent updates now that DOM exists
    ordered.forEach(id => widget.updateHTMLIndent(id));

    // Helper to set inputs on a codeline (after DOM created)
    const setInputs = (id, values) => {
      if (!id) return;
      const li = document.getElementById(id);
      if (!li) return;
      const inputs = Array.from(li.querySelectorAll('input.text-box'));
      values.forEach((v, i) => {
        if (inputs[i]) {
          inputs[i].value = v;
          inputs[i].dispatchEvent(new Event('input', { bubbles: true }));
          inputs[i].dispatchEvent(new Event('blur', { bubbles: true }));
        }
      });
    };

    // Fill blanks with the correct solution values
    setInputs(ordered[1], ['0']); // total = 0
    setInputs(ordered[2], ['start', 'stop']); // while start <= stop
    setInputs(ordered[3], ['start']); // total += start
    setInputs(ordered[4], ['1']); // start += 1
  });

  // Run tests again and assert full pass
  await studentPage.getByRole('button', { name: 'Run Tests' }).click();
  await studentPage.waitForSelector('.test-result-summary.full-pass', { timeout: 30000 });
  await expect(studentPage.locator('.test-result-summary.full-pass')).toBeVisible();

  await studentContext.close();
});

test('student can navigate back to task list and see in-progress status', async ({ page, browser }) => {
  const unique = Date.now();
  const teacherUsername = `teacher_list_${unique}`;
  const teacherEmail = `teacher_list_${unique}@example.com`;
  const teacherPassword = 'password123';
  const taskSetTitle = `Task List Test ${unique}`;

  // Teacher registers
  await registerTeacher(page, teacherUsername, teacherEmail, teacherPassword);
  await page.waitForSelector('#alert-placeholder .alert-success', { timeout: 10000 });

  // Teacher logs in
  await loginTeacher(page, teacherUsername, teacherPassword);
  await expect(page).toHaveURL(/\/teacher-dashboard$/);

  // Teacher creates a task set with tasks
  await createTaskSetWithTasks(
    page,
    taskSetTitle,
    `Task List Description for ${taskSetTitle}`,
    `Teacher Description for ${taskSetTitle}`,
    ['add_in_range', 'greater_num']
  );
  await page.waitForURL(/\/teacher-dashboard$/, { timeout: 10000 });

  // Get the student-facing URL
  const studentUrl = await getStudentUrl(page, taskSetTitle);

  // Open a new browser context for the student
  const studentContext = await browser.newContext();
  const studentPage = await studentContext.newPage();
  await studentPage.goto(studentUrl);

    // Register and login as student (username must be ≤20 chars due to HTML maxlength)
  const studentUsername = `st_${unique}`;
  const studentEmail = `student_${unique}@example.com`;

  await registerStudent(studentPage, studentUsername, studentEmail);
  await studentPage.waitForSelector('#alert-placeholder .alert-success', { timeout: 10000 });

  await studentPage.waitForURL(studentUrl, { timeout: 10000 });
  await studentPage.waitForSelector('#login-form', { timeout: 10000 });

  // Start listening for the login API response BEFORE triggering the login
  const loginResponsePromise = studentPage.waitForResponse(
    r => r.url().includes('/api/student_login')
  );

  await loginStudent(studentPage, studentUsername);

  const loginResponse = await loginResponsePromise;
  expect(loginResponse.status()).toBe(200);

  // Verify student is redirected to task list
  await studentPage.waitForURL(studentUrl + '/tasks', { timeout: 15000 });

  // Verify task list is displayed with tasks
  await expect(studentPage.locator('.task-set-item')).toHaveCount(2); // 2 tasks created (add_in_range, greater_num)
  await expect(studentPage.locator('.task-set-item', { hasText: 'add_in_range' })).toBeVisible();
  await expect(studentPage.locator('.task-set-item', { hasText: 'greater_num' })).toBeVisible();

  // Click on the "add_in_range" task
  await studentPage.locator('.task-set-item', { hasText: 'add_in_range' }).click();
  
  // Verify task page loads with "Start" button
  await studentPage.waitForSelector('#start-btn', { timeout: 10000 });
  await expect(studentPage.locator('#start-btn')).toBeVisible();

  // Click "Start" on the start page
  await studentPage.locator('#start-btn').click();

  // Wait for Parsons problem page to load
  await studentPage.waitForSelector('.btn.btn-primary:not([disabled])', { timeout: 30000 });

  // Navigate back to task list
  await studentPage.goBack();
  await studentPage.waitForURL(studentUrl + '/tasks', { timeout: 15000 });

  // Verify "add_in_range" task now shows "in progress" status
  const addInRangeTask = studentPage.locator('.task-set-item', { hasText: 'add_in_range' });
  await expect(addInRangeTask).toBeVisible();
  await expect(addInRangeTask.locator('text=in progress')).toBeVisible();

  await studentContext.close();
});


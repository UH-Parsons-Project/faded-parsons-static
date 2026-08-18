/*
 * Create Task page module
 * Handles task code + tests input and submission.
 */
(function initCreateTaskPage() {
  const TASK_CODE_DRAFT_KEY = 'create_task_draft_code';
  const TASK_TESTS_DRAFT_KEY = 'create_task_draft_tests';
  let editTaskId = null;

  function getCursorPositionDetails(text, index) {
    const safeIndex = Math.max(0, Math.min(index, text.length));
    const beforeCursor = text.slice(0, safeIndex);
    const line = beforeCursor.split('\n').length;
    const lastBreak = beforeCursor.lastIndexOf('\n');
    const column = safeIndex - lastBreak;
    return { line, column };
  }

  function updateCaretStatus(textarea, statusElement) {
    if (!statusElement) {
      return;
    }

    const { line, column } = getCursorPositionDetails(textarea.value, textarea.selectionStart);
    statusElement.textContent = `Ln ${line}, Col ${column}`;
  }

  function autoResize(textarea) {
    textarea.style.height = 'auto';
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, 220), 620);
    textarea.style.height = `${nextHeight}px`;
  }

  function indentOrUnindentSelection(textarea, shouldUnindent) {
    const indent = '    ';
    const value = textarea.value;
    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;

    if (!shouldUnindent && selectionStart === selectionEnd) {
      const updatedValue = `${value.slice(0, selectionStart)}${indent}${value.slice(selectionEnd)}`;
      textarea.value = updatedValue;
      textarea.selectionStart = selectionStart + indent.length;
      textarea.selectionEnd = selectionStart + indent.length;
      return;
    }

    const blockStart = value.lastIndexOf('\n', Math.max(0, selectionStart - 1)) + 1;
    const blockEndBreak = value.indexOf('\n', selectionEnd);
    const blockEnd = blockEndBreak === -1 ? value.length : blockEndBreak;

    const block = value.slice(blockStart, blockEnd);
    const lines = block.split('\n');
    let charsRemovedBeforeStart = 0;
    let charsDeltaTotal = 0;

    const transformed = lines.map((line, idx) => {
      if (shouldUnindent) {
        if (line.startsWith(indent)) {
          charsDeltaTotal -= indent.length;
          if (idx === 0) {
            charsRemovedBeforeStart = indent.length;
          }
          return line.slice(indent.length);
        }
        if (line.startsWith('\t')) {
          charsDeltaTotal -= 1;
          if (idx === 0) {
            charsRemovedBeforeStart = 1;
          }
          return line.slice(1);
        }
        return line;
      }

      charsDeltaTotal += indent.length;
      return `${indent}${line}`;
    });

    const replacedBlock = transformed.join('\n');
    textarea.value = `${value.slice(0, blockStart)}${replacedBlock}${value.slice(blockEnd)}`;

    if (shouldUnindent) {
      textarea.selectionStart = Math.max(blockStart, selectionStart - charsRemovedBeforeStart);
      textarea.selectionEnd = Math.max(textarea.selectionStart, selectionEnd + charsDeltaTotal);
    } else {
      textarea.selectionStart = selectionStart + indent.length;
      textarea.selectionEnd = selectionEnd + charsDeltaTotal;
    }
  }

  function setupEditorBehavior(textarea, statusElement, storageKey) {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      textarea.value = saved;
    }

    if (storageKey === TASK_CODE_DRAFT_KEY) {
      const preservedCode = sessionStorage.getItem('preserved_task_code');
      if (preservedCode) {
        textarea.value = preservedCode;
        sessionStorage.removeItem('preserved_task_code');
      }
    }

    autoResize(textarea);
    updateCaretStatus(textarea, statusElement);

    let tabCaptureEnabled = true;

    textarea.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        tabCaptureEnabled = false;
        return;
      }

      if (event.key !== 'Tab') {
        tabCaptureEnabled = true;
      }

      if (event.key === 'Tab') {
        if (!tabCaptureEnabled) return;
        event.preventDefault();
        indentOrUnindentSelection(textarea, event.shiftKey);
        autoResize(textarea);
        updateCaretStatus(textarea, statusElement);
      }
    });

    ['click', 'keyup', 'focus'].forEach((eventName) => {
      textarea.addEventListener(eventName, () => {
        updateCaretStatus(textarea, statusElement);
      });
    });

    textarea.addEventListener('input', () => {
      localStorage.setItem(storageKey, textarea.value);
      autoResize(textarea);
      updateCaretStatus(textarea, statusElement);
    });
  }

  function switchGuideTab(tabName, updateDropdown = true) {
    const tabBtns = document.querySelectorAll('.guide-tab-btn');
    const tabPanes = document.querySelectorAll('.guide-tab-pane');

    tabBtns.forEach((btn) => {
      const isMatch = btn.getAttribute('data-tab') === tabName;
      btn.classList.toggle('active', isMatch);
      btn.setAttribute('aria-selected', isMatch ? 'true' : 'false');
    });

    tabPanes.forEach((pane) => {
      const isMatch = pane.id === `guide-pane-${tabName}`;
      pane.classList.toggle('active', isMatch);
    });

    if (updateDropdown) {
      const evalTypeInput = document.getElementById('eval-type');
      if (evalTypeInput && evalTypeInput.value !== tabName) {
        evalTypeInput.value = tabName;
        evalTypeInput.dispatchEvent(new Event('change'));
      }
    }
  }

  function setupGuideToggle() {
    const guideToggle = document.getElementById('guide-toggle');
    const guideContent = document.getElementById('guide-content');

    if (!guideToggle || !guideContent) {
      return;
    }

    guideToggle.addEventListener('click', () => {
      guideToggle.classList.toggle('expanded');
      guideContent.classList.toggle('expanded');
    });

    const tabBtns = document.querySelectorAll('.guide-tab-btn');
    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tabName = btn.getAttribute('data-tab');
        if (tabName) {
          switchGuideTab(tabName, true);
        }
      });
    });
  }

  function setupCopyButtons() {
    const copyButtons = document.querySelectorAll('.copy-btn');

    copyButtons.forEach((button) => {
      button.addEventListener('click', async () => {
        const evalType = button.getAttribute('data-eval-type');
        const copyCodeTarget = button.getAttribute('data-copy-code-target') || button.getAttribute('data-copy-target');
        const copyTestsTarget = button.getAttribute('data-copy-tests-target');

        const taskCodeInput = document.getElementById('task-code');
        const taskTestsInput = document.getElementById('task-tests');
        const evalTypeInput = document.getElementById('eval-type');

        let textCopied = false;

        if (evalType && evalTypeInput) {
          evalTypeInput.value = evalType;
          evalTypeInput.dispatchEvent(new Event('change'));
        }

        if (copyCodeTarget && taskCodeInput) {
          const codeEl = document.getElementById(copyCodeTarget);
          if (codeEl) {
            taskCodeInput.value = codeEl.textContent;
            taskCodeInput.dispatchEvent(new Event('input'));
            textCopied = true;
          }
        }

        if (taskTestsInput) {
          if (copyTestsTarget) {
            const testsEl = document.getElementById(copyTestsTarget);
            if (testsEl) {
              taskTestsInput.value = testsEl.textContent;
              taskTestsInput.dispatchEvent(new Event('input'));
              textCopied = true;
            }
          } else if (evalType === 'order_only') {
            taskTestsInput.value = '';
            taskTestsInput.dispatchEvent(new Event('input'));
          }
        }

        if (textCopied) {
          try {
            await navigator.clipboard.writeText(taskCodeInput ? taskCodeInput.value : '');
          } catch (e) {
            // Ignore clipboard permission errors if fallback copied into textareas
          }

          const originalHTML = button.innerHTML;
          button.innerHTML = '<i class="fas fa-check"></i> Copied to Editors';
          button.classList.add('copied');

          setTimeout(() => {
            button.innerHTML = originalHTML;
            button.classList.remove('copied');
          }, 2000);
        }
      });
    });
  }

  async function loadEditData(taskId, taskCodeInput, taskTestsInput) {
    try {
      const response = await fetch(`/api/tasks/${taskId}`);
      if (!response.ok) {
        return;
      }
      const task = await response.json();
      const solutionCode = task.correct_solution?.solution_code || '';
      const teacherTests = task.correct_solution?.teacher_tests || '';
      const evalType = task.correct_solution?.eval_type || 'unit_test';
      const expectedOutput = task.correct_solution?.expected_output || '';

      if (taskCodeInput) {
        taskCodeInput.value = solutionCode;
        taskCodeInput.dispatchEvent(new Event('input'));
      }
      if (taskTestsInput) {
        if (evalType === 'stdout') {
          taskTestsInput.value = expectedOutput;
        } else {
          taskTestsInput.value = teacherTests;
        }
        taskTestsInput.dispatchEvent(new Event('input'));
      }
      const evalTypeInput = document.getElementById('eval-type');
      if (evalTypeInput) {
        evalTypeInput.value = evalType;
        evalTypeInput.dispatchEvent(new Event('change'));
      }

      const pageTitle = document.querySelector('.page-title');
      if (pageTitle) {
        pageTitle.textContent = 'Edit Task';
      }
      const submitBtn = document.getElementById('submit-task');
      if (submitBtn) {
        submitBtn.textContent = 'Continue To Block Builder (Edit)';
      }
    } catch (err) {
      console.error('Failed to load task for editing:', err);
    }
  }

  function setupCreateTaskForm() {
    const form = document.getElementById('create-task-form');
    const submitBtn = document.getElementById('submit-task');
    const clearDraftsBtn = document.getElementById('clear-drafts');
    const cancelBtn = document.getElementById('cancel-task');
    const taskCodeInput = document.getElementById('task-code');
    const taskTestsInput = document.getElementById('task-tests');
    const taskCodeStatus = document.getElementById('task-code-status');
    const taskTestsStatus = document.getElementById('task-tests-status');
    const clearButtons = document.querySelectorAll('[data-clear-target]');
    
    const evalTypeInput = document.getElementById('eval-type');
    const taskTestsPanel = document.getElementById('task-tests-panel');
    const taskTestsLabel = document.getElementById('task-tests-label');
    const taskTestsHint = document.getElementById('task-tests-hint');
    const taskCodeHint = document.getElementById('task-code-hint');

    if (!form || !submitBtn || !taskCodeInput || !taskTestsInput) {
      return;
    }

    if (evalTypeInput) {
      evalTypeInput.addEventListener('change', () => {
        const val = evalTypeInput.value;
        switchGuideTab(val, false);
        if (val === 'order_only') {
          taskTestsPanel.style.display = 'none';
          taskCodeInput.placeholder = 'Buy all ingredients\nBake a pie\nEat the pie';
          if (taskCodeHint) taskCodeHint.innerHTML = 'Example: <code>Buy all ingredients</code>';
        } else if (val === 'stdout') {
          taskTestsPanel.style.display = 'block';
          taskTestsLabel.textContent = 'Expected Output';
          taskTestsHint.textContent = 'Exact output expected from the print statements';
          taskTestsInput.placeholder = 'Hello\nWorld';
          taskCodeInput.placeholder = 'print("Hello")\nprint("World")';
          if (taskCodeHint) taskCodeHint.innerHTML = 'Example: <code>print("Hello")</code>';
        } else {
          taskTestsPanel.style.display = 'block';
          taskTestsLabel.textContent = 'Task Tests';
          taskTestsHint.textContent = 'Use any Python test style you prefer';
          taskTestsInput.placeholder = 'assert sum(1, 5) == 6\nassert sum(5, 5) == 10';
          taskCodeInput.placeholder = 'def sum(a, b):\n    total = a + b\n    return total';
          if (taskCodeHint) taskCodeHint.innerHTML = 'Example: <code>def sum(a, b):</code>';
        }
      });
      // trigger initial update
      evalTypeInput.dispatchEvent(new Event('change'));
    }

    const params = new URLSearchParams(window.location.search);
    const taskIdParam = params.get('task_id');
    if (taskIdParam) {
      editTaskId = parseInt(taskIdParam, 10);
      localStorage.removeItem(TASK_CODE_DRAFT_KEY);
      localStorage.removeItem(TASK_TESTS_DRAFT_KEY);
    }

    setupEditorBehavior(taskCodeInput, taskCodeStatus, TASK_CODE_DRAFT_KEY);
    setupEditorBehavior(taskTestsInput, taskTestsStatus, TASK_TESTS_DRAFT_KEY);

    clearButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const targetId = button.getAttribute('data-clear-target');
        const target = document.getElementById(targetId);
        if (!target) {
          return;
        }

        target.value = '';
        target.dispatchEvent(new Event('input'));
        target.focus();
      });
    });

    if (clearDraftsBtn) {
      clearDraftsBtn.addEventListener('click', () => {
        localStorage.removeItem(TASK_CODE_DRAFT_KEY);
        localStorage.removeItem(TASK_TESTS_DRAFT_KEY);
        taskCodeInput.value = '';
        taskTestsInput.value = '';
        taskCodeInput.dispatchEvent(new Event('input'));
        taskTestsInput.dispatchEvent(new Event('input'));
        taskCodeInput.focus();
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        const confirmed = window.confirm(
          'Are you sure you want to cancel? Any unsaved changes will be lost.'
        );
        if (!confirmed) {
          return;
        }
        window.location.href = '/teacher-dashboard';
      });
    }

    [taskCodeInput, taskTestsInput].forEach((input) => {
      input.addEventListener('keydown', (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault();
          submitBtn.click();
        }
      });
    });

    submitBtn.addEventListener('click', async () => {
      const taskCode = taskCodeInput.value;
      const taskTests = taskTestsInput.value;
      const evalType = evalTypeInput ? evalTypeInput.value : 'unit_test';

      try {
        let tests = '';
        let expectedOutput = '';
        if (evalType === 'stdout') {
          expectedOutput = taskTests;
        } else if (evalType === 'unit_test') {
          tests = taskTests;
        }

        const draftPayload = {
          taskCode,
          taskTests: tests,
          expectedOutput: expectedOutput,
          evalType: evalType,
          savedAt: new Date().toISOString(),
          taskId: editTaskId,
        };

        sessionStorage.setItem('create_task_draft_payload', JSON.stringify(draftPayload));
        sessionStorage.setItem('preserved_task_code', taskCode);

        localStorage.removeItem(TASK_CODE_DRAFT_KEY);
        localStorage.removeItem(TASK_TESTS_DRAFT_KEY);
        window.location.href = '/create-task-editor';
      } catch (error) {
        console.error('Task creation failed:', error);
        alert('Failed to submit task. Please try again.');
      }
    });

    if (editTaskId && !localStorage.getItem(TASK_CODE_DRAFT_KEY)) {
      loadEditData(editTaskId, taskCodeInput, taskTestsInput);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    setupGuideToggle();
    setupCopyButtons();
    setupCreateTaskForm();
  });
})();

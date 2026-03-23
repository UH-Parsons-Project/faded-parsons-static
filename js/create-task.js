/*
 * Create Task page module
 * Handles task code + tests input and submission.
 */
(function initCreateTaskPage() {
  const TASK_CODE_DRAFT_KEY = 'create_task_draft_code';
  const TASK_TESTS_DRAFT_KEY = 'create_task_draft_tests';

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

    autoResize(textarea);
    updateCaretStatus(textarea, statusElement);

    textarea.addEventListener('keydown', (event) => {
      if (event.key === 'Tab') {
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

  function setupCreateTaskForm() {
    const form = document.getElementById('create-task-form');
    const submitBtn = document.getElementById('submit-task');
    const clearDraftsBtn = document.getElementById('clear-drafts');
    const taskCodeInput = document.getElementById('task-code');
    const taskTestsInput = document.getElementById('task-tests');
    const taskCodeStatus = document.getElementById('task-code-status');
    const taskTestsStatus = document.getElementById('task-tests-status');
    const clearButtons = document.querySelectorAll('[data-clear-target]');

    if (!form || !submitBtn || !taskCodeInput || !taskTestsInput) {
      return;
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

    [taskCodeInput, taskTestsInput].forEach((input) => {
      input.addEventListener('keydown', (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault();
          submitBtn.click();
        }
      });
    });

    submitBtn.addEventListener('click', async () => {
      const taskCode = taskCodeInput.value.trim();
      const taskTests = taskTestsInput.value.trim();

      if (!taskCode || !taskTests) {
        alert('Please fill in both the task code and the tests.');
        return;
      }

      try {
        const draftPayload = {
          taskCode,
          taskTests,
          savedAt: new Date().toISOString(),
        };

        sessionStorage.setItem('create_task_draft_payload', JSON.stringify(draftPayload));

        localStorage.removeItem(TASK_CODE_DRAFT_KEY);
        localStorage.removeItem(TASK_TESTS_DRAFT_KEY);
        window.location.href = '/create_task_problem';
      } catch (error) {
        console.error('Task creation failed:', error);
        alert('Failed to submit task. Please try again.');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', setupCreateTaskForm);
})();

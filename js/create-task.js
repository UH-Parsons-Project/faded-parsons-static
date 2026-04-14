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
      console.log(`Loading ${storageKey} from localStorage:`, saved);
      textarea.value = saved;
    }

    if (storageKey === TASK_CODE_DRAFT_KEY) {
      const preservedCode = sessionStorage.getItem('preserved_task_code');
      if (preservedCode) {
        console.log('Loading preserved task code from sessionStorage:', preservedCode);
        textarea.value = preservedCode;
        sessionStorage.removeItem('preserved_task_code');
      }
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
      console.log(`Saving ${storageKey} to localStorage:`, textarea.value);
      localStorage.setItem(storageKey, textarea.value);
      autoResize(textarea);
      updateCaretStatus(textarea, statusElement);
    });
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
  }

  function setupCopyButtons() {
    const copyButtons = document.querySelectorAll('.copy-btn');

    copyButtons.forEach((button) => {
      button.addEventListener('click', async () => {
        const targetId = button.getAttribute('data-copy-target');
        if (!targetId) {
          return;
        }

        const sourceElement = document.getElementById(targetId);
        if (!sourceElement) {
          return;
        }

        const textToCopy = sourceElement.textContent;

        try {
          await navigator.clipboard.writeText(textToCopy);

          const originalHTML = button.innerHTML;
          button.innerHTML = '<i class="fas fa-check"></i> Copied';
          button.classList.add('copied');

          setTimeout(() => {
            button.innerHTML = originalHTML;
            button.classList.remove('copied');
          }, 2000);
        } catch (error) {
          console.error('Failed to copy:', error);
          alert('Failed to copy. Please try manually selecting and copying.');
        }
      });
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
      const taskCode = taskCodeInput.value;
      const taskTests = taskTestsInput.value;

      try {
        const draftPayload = {
          taskCode,
          taskTests,
          savedAt: new Date().toISOString(),
        };

        sessionStorage.setItem('create_task_draft_payload', JSON.stringify(draftPayload));

        localStorage.removeItem(TASK_CODE_DRAFT_KEY);
        localStorage.removeItem(TASK_TESTS_DRAFT_KEY);
        window.location.href = '/create-task-editor';
      } catch (error) {
        console.error('Task creation failed:', error);
        alert('Failed to submit task. Please try again.');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    setupGuideToggle();
    setupCopyButtons();
    setupCreateTaskForm();
  });
})();

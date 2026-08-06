/*
 * Create Task Problem Builder
 * Builds parsons-style code blocks from teacher-authored source code.
 */
import { FiniteWorker } from './worker-manager.js';
import { processTestError } from './doctest-grader.js';
import { initProtectedPage, initBurgerMenu } from "/js/auth-ui.js";

initProtectedPage('/');
initBurgerMenu();

(function initCreateTaskProblemBuilder() {
  const DRAFT_KEY = 'create_task_draft_payload';
  const BLOCKS_KEY = 'create_task_builder_blocks';
  const BLOCKS_SOURCE_KEY = 'create_task_builder_blocks_source';
  const META_KEY = 'create_task_builder_meta';
  const META_SOURCE_KEY = 'create_task_builder_meta_source';
  const MODEL_ANSWER_KEY = 'create_task_builder_model_answer';
  const MODEL_ANSWER_REPR_KEY = 'create_task_builder_model_answer_repr';
  const MODEL_ANSWER_SOURCE_KEY = 'create_task_builder_model_answer_source';
  const MODEL_ANSWER_UPDATED_AT_KEY = 'create_task_builder_model_answer_updated_at';

  let draftPayload = null;
  let parsonsWidget = null;
  let previewParsonsWidget = null;
  let modelAnswerCode = '';
  let modelAnswerRepr = '';
  let modelAnswerUpdatedAt = '';
  let hasOpenedStudentPreview = false;
  let testsPassed = false;

  function updateAddToListState() {
    const addToListBtn = document.getElementById('add-to-problem-list');
    if (addToListBtn) {
      addToListBtn.disabled = !(testsPassed && hasOpenedStudentPreview);
    }

    updateChecklist();
  }

  function updateChecklist() {
    const checklist = document.getElementById('task-checklist');
    if (!checklist) {
      return;
    }

    const taskTitleInput = document.getElementById('task-title');
    const startDescriptionInput = document.getElementById('start-description');
    const descriptionInput = document.getElementById('problem-description');
    const testsInput = document.getElementById('tests-input');
    const customErrorMessagesInput = document.getElementById('custom-error-messages');
    const solutionList = document.querySelector('#solution-sortable ul');
    const hasSolutionBlocks = Boolean(solutionList && solutionList.querySelectorAll('li').length > 0);

    const items = [
      { key: 'title', done: Boolean(taskTitleInput && taskTitleInput.value.trim()) },
      { key: 'start-description', done: Boolean(startDescriptionInput && startDescriptionInput.value.trim()) },
      { key: 'problem-description', done: Boolean(descriptionInput && descriptionInput.value.trim()) },
      { key: 'solution-blocks', done: hasSolutionBlocks },
      { key: 'model-answer', done: Boolean(modelAnswerCode) },
      { key: 'custom-errors', done: Boolean(customErrorMessagesInput && customErrorMessagesInput.value.trim()), optional: true },
      { key: 'tests-written', done: Boolean(testsInput && testsInput.value.trim()) },
      { key: 'tests-passed', done: testsPassed },
      { key: 'previewed', done: hasOpenedStudentPreview },
    ];

    items.forEach(({ key, done, optional }) => {
      const item = checklist.querySelector(`[data-check="${key}"]`);
      if (!item) {
        return;
      }

      item.classList.toggle('is-done', done);

      const status = item.querySelector('.checklist-status');
      if (!status) {
        return;
      }

      if (done) {
        status.textContent = optional ? 'Added' : 'Done';
        status.className = 'checklist-status badge badge-success';
      } else {
        status.textContent = optional ? 'Optional' : 'Missing';
        status.className = `checklist-status badge ${optional ? 'badge-secondary' : 'badge-danger'}`;
      }
    });
  }

  function escapeHtml(unsafe) {
    return (unsafe || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function openStudentPreview() {
    const modal = document.getElementById('student-preview-modal');
    const previewTaskTitle = document.getElementById('preview-task-title');
    const previewStartIntro = document.getElementById('preview-start-intro');
    const previewText = document.getElementById('preview-problem-text');
    const previewTaskType = document.getElementById('preview-task-type');
    const previewSource = document.getElementById('preview-source-sortable');
    const previewSolution = document.getElementById('preview-solution-sortable');
    const previewWrittenTests = document.getElementById('preview-written-tests');
    const previewModelAnswer = document.getElementById('preview-model-answer');
    const taskTitleInput = document.getElementById('task-title');
    const descriptionInput = document.getElementById('problem-description');
    const startDescriptionInput = document.getElementById('start-description');
    const testsInput = document.getElementById('tests-input');
    const ParsonsWidgetCtor = window.ParsonsWidget;

    if (!modal || !previewTaskTitle || !previewStartIntro || !previewText || !previewTaskType || !previewSource || !previewSolution || !previewWrittenTests || !previewModelAnswer || !parsonsWidget || !ParsonsWidgetCtor) {
      return;
    }

    const taskTitle = taskTitleInput?.value.trim() || 'No task name provided yet.';
    const startIntro = startDescriptionInput?.value.trim() || 'No start page intro provided yet.';
    const problemStatement = descriptionInput?.value.trim() || 'No problem statement provided yet.';
    const taskType = getTaskTypeValue();
    previewTaskTitle.innerHTML = escapeHtml(taskTitle).replace(/\n/g, '<br>');
    previewStartIntro.innerHTML = escapeHtml(startIntro).replace(/\n/g, '<br>');
    previewText.innerHTML = escapeHtml(problemStatement).replace(/\n/g, '<br>');
    previewTaskType.textContent = `Task type: ${taskType}`;
    previewWrittenTests.textContent = testsInput?.value.trim() || 'No tests written yet.';
    previewModelAnswer.textContent = modelAnswerCode || 'No model answer set yet.';

    previewSource.innerHTML = '';
    previewSolution.innerHTML = '';

    previewParsonsWidget = new ParsonsWidgetCtor({
      sortableId: previewSolution,
      trashId: previewSource,
      containment: previewSource.closest('.card-body'),
      trash_label: 'Drag from here',
      solution_label: 'Construct your solution here, including indents',
    });

    previewParsonsWidget.id_prefix = 'preview-sortable-codeline';

    const previewRepr = buildCustomRepr() || modelAnswerRepr;
    previewParsonsWidget.init(previewRepr);

    const previewSolutionIds = previewParsonsWidget.studentGiven.map((line) => line.id);
    const previewSolutionSet = new Set(previewSolutionIds);
    const previewSourceIds = previewParsonsWidget.modified_lines
      .filter((line) => !previewSolutionSet.has(line.id))
      .map((line) => line.id);
    previewParsonsWidget.createHTMLFromLists(previewSolutionIds, previewSourceIds);

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');

    hasOpenedStudentPreview = true;
    updateAddToListState();
  }

  function closeStudentPreview() {
    const modal = document.getElementById('student-preview-modal');
    if (!modal) {
      return;
    }

    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }

  function setupPreviewModal() {
    const modal = document.getElementById('student-preview-modal');
    const closeBtn = document.getElementById('close-student-preview');

    if (!modal || !closeBtn) {
      return;
    }

    closeBtn.addEventListener('click', closeStudentPreview);

    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        closeStudentPreview();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && modal.classList.contains('open')) {
        closeStudentPreview();
      }
    });
  }

  function extractDefaultTitleFromCode(code) {
    const normalized = normalizeSourceCode(code || '');
    const lines = normalized.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      const match = trimmed.match(/^(def|class)\s+([A-Za-z_][A-Za-z0-9_]*)/);
      if (match) {
        return match[2];
      }
    }
    return 'custom_task';
  }

  function readDraftPayload() {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) {
        return null;
      }
      return JSON.parse(raw);
    } catch (error) {
      console.error('Failed to parse task draft payload:', error);
      return null;
    }
  }

  function normalizeSourceCode(code) {
    return (code || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  function getCachedParsonsRepr(sourceCode) {
    const cached = sessionStorage.getItem(BLOCKS_KEY);
    const cachedSource = sessionStorage.getItem(BLOCKS_SOURCE_KEY);
    const normalizedSource = normalizeSourceCode(sourceCode || '');

    if (typeof cached !== 'string' || typeof cachedSource !== 'string') {
      return '';
    }

    return cachedSource === normalizedSource ? cached : '';
  }

  function buildCustomRepr() {
    if (!parsonsWidget) {
      return '';
    }
    const solutionUl = parsonsWidget.options.sortableId.querySelector('ul');
    if (!solutionUl) {
      return '';
    }
    const solutionLines = parsonsWidget.getModifiedCode(solutionUl);
    const baseRepr = parsonsWidget.reprCode();
    if (!baseRepr.trim()) {
      return '';
    }
    const reprLines = baseRepr.split('\n');
    return reprLines.map((line, index) => {
      if (index < solutionLines.length && solutionLines[index]?.studentGiven) {
        return line.replace(/(#\d+given)/, '$1 #preplace');
      }
      return line;
    }).join('\n');
  }

  function persistParsonsRepr() {
    if (!parsonsWidget) {
      return;
    }
    sessionStorage.setItem(BLOCKS_KEY, buildCustomRepr());
    sessionStorage.setItem(BLOCKS_SOURCE_KEY, normalizeSourceCode(draftPayload?.taskCode || ''));
  }

  function loadMetaFromSession(sourceCode, expectedTaskId = null) {
    try {
      const raw = sessionStorage.getItem(META_KEY);

      if (!raw) {
        return { taskTitle: '', description: '', startDescription: '', tests: '', customErrorMessages: '', taskType: null, isPublic: true, isValid: false };
      }

      const parsed = JSON.parse(raw);
      const storedSource = sessionStorage.getItem(META_SOURCE_KEY);
      const normalizedSource = normalizeSourceCode(sourceCode || '');
      const storedTaskId = typeof parsed.taskId === 'number'
        ? parsed.taskId
        : (typeof parsed.taskId === 'string' && parsed.taskId.trim() ? parseInt(parsed.taskId, 10) : null);

      if (expectedTaskId !== null) {
        if (storedTaskId !== expectedTaskId) {
          return { taskTitle: '', description: '', startDescription: '', tests: '', customErrorMessages: '', taskType: null, isPublic: true, isValid: false };
        }
      } else if (storedSource && normalizedSource && storedSource !== normalizedSource) {
        return { taskTitle: '', description: '', startDescription: '', tests: '', customErrorMessages: '', taskType: null, isPublic: true, isValid: false };
      }

      return {
        taskTitle: typeof parsed.taskTitle === 'string' ? parsed.taskTitle : '',
        description: typeof parsed.description === 'string' ? parsed.description : '',
        startDescription: typeof parsed.startDescription === 'string' ? parsed.startDescription : '',
        tests: typeof parsed.tests === 'string' ? parsed.tests : '',
        customErrorMessages: typeof parsed.customErrorMessages === 'string' ? parsed.customErrorMessages : '',
        taskType: typeof parsed.taskType === 'string' ? parsed.taskType : 'normal',
        isPublic: typeof parsed.isPublic === 'boolean' ? parsed.isPublic : true,
        isValid: true,
      };
    } catch (error) {
      console.error('Failed to parse builder metadata cache:', error);
      return { taskTitle: '', description: '', startDescription: '', tests: '', customErrorMessages: '', taskType: null, isPublic: true, isValid: false };
    }
  }

  function getTaskTypeValue() {
    const taskTypeInput = document.getElementById('task-type');
    return taskTypeInput && taskTypeInput.value.trim() ? taskTypeInput.value.trim() : 'normal';
  }

  function getVisibilityValue() {
    const visibilityInput = document.getElementById('task-visibility-public');
    return visibilityInput ? !visibilityInput.checked : true;
  }

  function updateVisibilityWarning() {
    const warningBox = document.getElementById('visibility-warning-box');
    const visibilityInput = document.getElementById('task-visibility-public');
    if (!warningBox || !visibilityInput) {
      return;
    }

    if (visibilityInput.checked) {
      warningBox.innerHTML = `
        <div class="alert alert-info mb-0" role="alert" style="font-size: 0.88rem; line-height: 1.5; border-left: 5px solid #0ea5e9; background-color: #f0f9ff; color: #0369a1;">
          <i class="fas fa-lock mr-2" style="color: #0ea5e9;"></i>
          <strong>Private Task:</strong> This task is private and visible only to you.
        </div>
      `;
    } else {
      warningBox.innerHTML = `
        <div class="alert alert-success mb-0" role="alert" style="font-size: 0.88rem; line-height: 1.5; border-left: 5px solid #10b981; background-color: #ecfdf5; color: #065f46;">
          <i class="fas fa-users mr-2" style="color: #10b981;"></i>
          <strong>Public Task (Recommended):</strong> Keeping tasks public is preferred as it helps enhance the experience of other teachers and students. Please note that since others can use this task, it will remain active in the system even if your account is later removed.
        </div>
      `;
    }
  }

  function saveMetaToSession(taskTitle, description, startDescription, tests, customErrorMessages, isPublic, taskType) {
    const taskTypeInput = document.getElementById('task-type');
    sessionStorage.setItem(META_KEY, JSON.stringify({
      taskTitle,
      description,
      startDescription,
      tests,
      customErrorMessages,
      taskType: typeof taskType === 'string' ? taskType : (taskTypeInput?.value || 'normal'),
      isPublic: typeof isPublic === 'boolean' ? isPublic : true,
      taskId: draftPayload?.taskId ?? null,
    }));
    sessionStorage.setItem(META_SOURCE_KEY, normalizeSourceCode(draftPayload?.taskCode || ''));
  }

  function loadModelAnswerFromSession(sourceCode) {
    const rawModelAnswer = sessionStorage.getItem(MODEL_ANSWER_KEY);
    const rawSource = sessionStorage.getItem(MODEL_ANSWER_SOURCE_KEY);
    const rawUpdatedAt = sessionStorage.getItem(MODEL_ANSWER_UPDATED_AT_KEY);
    const normalizedSource = normalizeSourceCode(sourceCode || '');

    if (!rawModelAnswer || typeof rawSource !== 'string' || rawSource !== normalizedSource) {
      return { code: '', repr: '', updatedAt: '' };
    }

    return {
      code: rawModelAnswer,
      repr: sessionStorage.getItem(MODEL_ANSWER_REPR_KEY) || '',
      updatedAt: rawUpdatedAt || '',
    };
  }

  function saveModelAnswerToSession(code, repr) {
    modelAnswerCode = code || '';
    modelAnswerRepr = repr || '';
    modelAnswerUpdatedAt = new Date().toISOString();
    sessionStorage.setItem(MODEL_ANSWER_KEY, modelAnswerCode);
    sessionStorage.setItem(MODEL_ANSWER_REPR_KEY, modelAnswerRepr);
    sessionStorage.setItem(MODEL_ANSWER_SOURCE_KEY, normalizeSourceCode(draftPayload?.taskCode || ''));
    sessionStorage.setItem(MODEL_ANSWER_UPDATED_AT_KEY, modelAnswerUpdatedAt);
    updateModelAnswerStatus();
  }

  function formatUpdatedAtLabel(isoString) {
    if (!isoString) {
      return '';
    }

    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) {
      return '';
    }

    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function updateModelAnswerStatus() {
    const status = document.getElementById('model-answer-status');
    const setModelAnswerBtn = document.getElementById('set-model-answer');

    if (setModelAnswerBtn) {
      setModelAnswerBtn.textContent = modelAnswerCode ? 'Update Model Answer' : 'Set as Model Answer';
    }

    if (!status) {
      return;
    }

    status.classList.toggle('saved', Boolean(modelAnswerCode));
    status.classList.toggle('missing', !modelAnswerCode);
    if (!modelAnswerCode) {
      status.textContent = 'No model answer saved yet.';
      return;
    }

    const updatedAtLabel = formatUpdatedAtLabel(modelAnswerUpdatedAt);
    status.textContent = updatedAtLabel
      ? `Model answer saved at ${updatedAtLabel}.`
      : 'Model answer saved.';
  }

  function updateCounters() {
    const sourceCount = document.getElementById('source-line-count');
    const blockCount = document.getElementById('block-count');
    const sourceList = document.querySelector('#source-sortable ul');
    const solutionList = document.querySelector('#solution-sortable ul');

    const sourceItems = sourceList ? sourceList.children.length : 0;
    const solutionItems = solutionList ? solutionList.children.length : 0;

    if (sourceCount) {
      sourceCount.textContent = `${sourceItems} blocks`;
    }
    if (blockCount) {
      blockCount.textContent = `${solutionItems} blocks`;
    }
  }

  function buildReprFromBlocks(taskData) {
    const blocks = taskData.code_blocks?.blocks || [];
    const solutionCode = (taskData.correct_solution?.solution_code || '').replace(/\r\n/g, '\n');
    const modelAnswer = (taskData.model_answer || '').replace(/\r\n/g, '\n');
    const INDENT = '    ';

    const solLinesList = solutionCode.split('\n').map(l => l.trimRight());
    const ansLinesList = modelAnswer.split('\n').map(l => l.trimRight());

    // Create a list of solution line objects for sequential matching
    const solLines = solLinesList.map((solLine, idx) => ({
      solLine,
      ansLine: ansLinesList[idx] || '',
      matched: false,
    }));

    return blocks.map((block) => {
      const codeWithBlanks = block.code.replace(/___/g, '!BLANK');
      const indented = INDENT.repeat(block.indent) + block.code;

      // Find the first unmatched solution line that matches this block's indented code
      const matchItem = solLines.find(item => {
        if (item.matched) return false;
        return item.solLine.replace(/!BLANK/g, '___') === indented;
      });

      if (matchItem) {
        matchItem.matched = true;
        let blanksSuffix = '';
        const solLine = matchItem.solLine;
        const ansLine = matchItem.ansLine;

        if (solLine.includes('!BLANK') && ansLine) {
          // Extract values using regex matching
          const segments = solLine.trim().split('!BLANK');
          const escapedSegments = segments.map(seg => seg.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'));
          const regexStr = '^' + escapedSegments.join('(.*?)') + '$';
          const regex = new RegExp(regexStr);
          const match = ansLine.trim().match(regex);
          if (match) {
            const values = match.slice(1);
            blanksSuffix = values.map(val => ' #blank' + val).join('');
          }
        }

        let line = `${codeWithBlanks}${blanksSuffix} #${block.indent}given`;
        if (block.given) {
          line += ' #preplace';
        }
        return line;
      }

      return codeWithBlanks;
    }).join('\n');
  }

  function renderParsonsBoard(initialText) {
    const sourceSortable = document.getElementById('source-sortable');
    const solutionSortable = document.getElementById('solution-sortable');
    const ParsonsWidgetCtor = window.ParsonsWidget;

    if (!sourceSortable || !solutionSortable || !ParsonsWidgetCtor) {
      return;
    }

    sourceSortable.innerHTML = '';
    solutionSortable.innerHTML = '';

    parsonsWidget = new ParsonsWidgetCtor({
      sortableId: solutionSortable,
      trashId: sourceSortable,
      containment: sourceSortable.closest('.card-body'),
      trash_label: 'Drag from here',
      solution_label: 'Solution &mdash; drag blocks here, double click to pin',
      onSortableUpdate: () => {
        refreshGivenToggles();
        updateCounters();
        persistParsonsRepr();
        hasOpenedStudentPreview = false;
        updateAddToListState();
      },
    });

    parsonsWidget.init(initialText);

    const solutionIds = parsonsWidget.given.map((line) => line.id);
    const solutionSet = new Set(solutionIds);
    const sourceIds = parsonsWidget.modified_lines
      .filter((line) => !solutionSet.has(line.id))
      .map((line) => line.id);

    parsonsWidget.createHTMLFromLists(solutionIds, sourceIds);
    parsonsWidget.setLineNumbers();
    injectDeleteButtons(sourceSortable);
    injectDeleteButtons(solutionSortable);
    injectGivenToggles(solutionSortable);
    updateCounters();
  }

  function getSolutionCodeWithBlanks() {
    const indentConstant = '    ';
    const lines = parsonsWidget.getModifiedCode(
      parsonsWidget.options.sortableId.querySelector('ul')
    );
    let code = '';
    for (const line of lines) {
      const clone = document.getElementById(line.id).cloneNode(true);
      clone.querySelectorAll('input').forEach((inp) => inp.replaceWith('!BLANK'));
      clone.querySelectorAll('.line-number, .block-delete-btn').forEach((el) => el.remove());
      clone.innerText = clone.innerText.trimRight();
      code += indentConstant.repeat(line.indent) + clone.innerText + '\n';
    }
    return code.trim();
  }

  function injectDeleteButtons(container) {
    container.querySelectorAll('li').forEach((li) => {
      if (!li.querySelector('.block-delete-btn')) {
        const btn = document.createElement('button');
        btn.className = 'block-delete-btn';
        btn.setAttribute('aria-label', 'Delete block');
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteBlock(li.id);
        });
        li.appendChild(btn);
      }
    });
  }

  function injectGivenToggles(container) {
    if (!parsonsWidget) {
      return;
    }
    container.querySelectorAll('li').forEach((li) => {
      const lineObj = parsonsWidget.modified_lines.find((l) => l.id === li.id);
      const isGiven = lineObj?.studentGiven || false;
      li.classList.toggle('student-given', isGiven);

      if (!li.querySelector('.given-toggle-btn')) {
        const btn = document.createElement('button');
        btn.className = 'given-toggle-btn';
        btn.setAttribute('aria-label', 'Double-click block to toggle pre-placing for students');
        btn.title = 'Double-click block to toggle pre-placed for students';
        btn.setAttribute('aria-pressed', isGiven ? 'true' : 'false');
        btn.setAttribute('tabindex', '-1');
        li.appendChild(btn);
      }

      if (!li.dataset.givenDblclick) {
        li.dataset.givenDblclick = 'true';
        li.addEventListener('dblclick', (e) => {
          if (li.querySelector('.given-toggle-btn')) {
            e.stopPropagation();
            toggleStudentGiven(li.id);
          }
        });
      }
    });
  }

  function refreshGivenToggles() {
    if (!parsonsWidget) {
      return;
    }
    const sourceSortable = document.getElementById('source-sortable');
    const solutionSortable = document.getElementById('solution-sortable');
    sourceSortable?.querySelectorAll('li').forEach((li) => {
      const btn = li.querySelector('.given-toggle-btn');
      if (btn) {
        btn.remove();
        li.classList.remove('student-given');
        const lineObj = parsonsWidget.modified_lines.find((l) => l.id === li.id);
        if (lineObj) {
          lineObj.studentGiven = false;
        }
      }
    });
    if (solutionSortable) {
      injectGivenToggles(solutionSortable);
    }
  }

  function toggleStudentGiven(blockId) {
    if (!parsonsWidget) {
      return;
    }
    const lineObj = parsonsWidget.modified_lines.find((l) => l.id === blockId);
    if (!lineObj) {
      return;
    }
    lineObj.studentGiven = !lineObj.studentGiven;
    const el = document.getElementById(blockId);
    el?.classList.toggle('student-given', lineObj.studentGiven);
    const btn = el?.querySelector('.given-toggle-btn');
    if (btn) {
      btn.setAttribute('aria-pressed', lineObj.studentGiven ? 'true' : 'false');
    }
    persistParsonsRepr();
    hasOpenedStudentPreview = false;
    updateAddToListState();
  }

  function deleteBlock(blockId) {
    if (!parsonsWidget) {
      return;
    }
    parsonsWidget.modified_lines = parsonsWidget.modified_lines.filter(
      (line) => line.id !== blockId
    );
    const el = document.getElementById(blockId);
    if (el) {
      el.remove();
    }
    if (window.$) {
      window.$('#source-sortable ul').sortable('refresh');
      window.$('#solution-sortable ul').sortable('refresh');
    }
    updateCounters();
    persistParsonsRepr();
    hasOpenedStudentPreview = false;
    updateAddToListState();
  }

  function addCustomBlockToSource(blockCode) {
    if (!parsonsWidget) {
      return;
    }

    const code = blockCode.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trimEnd();
    if (!code.trim()) {
      return;
    }

    const nextIndex = parsonsWidget.nextCustomIndex !== undefined
      ? parsonsWidget.nextCustomIndex
      : parsonsWidget.modified_lines.length;

    if (parsonsWidget.nextCustomIndex !== undefined) {
      parsonsWidget.nextCustomIndex++;
    } else {
      parsonsWidget.nextCustomIndex = nextIndex + 1;
    }

    const lineObject = {
      widget: parsonsWidget,
      code,
      indent: 0,
      distractor: false,
      orig: nextIndex,
      id: `${parsonsWidget.id_prefix}${nextIndex}`,
    };

    parsonsWidget.modified_lines.push(lineObject);

    const sourceList = document.querySelector('#source-sortable ul');
    if (!sourceList) {
      return;
    }

    sourceList.insertAdjacentHTML('beforeend', parsonsWidget.codeLineToHTML({...lineObject}));

    const newLi = document.getElementById(lineObject.id);
    if (newLi) {
      injectDeleteButtons(newLi.parentElement);
    }

    if (window.$) {
      window.$('#source-sortable ul').sortable('refresh');
      window.$('#solution-sortable ul').sortable('refresh');
    }

    updateCounters();
    persistParsonsRepr();
  }

  function setupGuideToggle() {
    const toggle = document.getElementById('problem-guide-toggle');
    const content = document.getElementById('problem-guide-content');

    if (!toggle || !content) {
      return;
    }

    toggle.addEventListener('click', () => {
      const isExpanded = toggle.classList.toggle('expanded');
      content.classList.toggle('expanded', isExpanded);
      toggle.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
    });
  }

  function setupChecklistNavigation() {
    const checklist = document.getElementById('task-checklist');
    if (!checklist) {
      return;
    }

    checklist.addEventListener('click', (event) => {
      const btn = event.target.closest('.checklist-item-btn');
      if (!btn) {
        return;
      }

      const targetId = btn.dataset.target;
      const target = targetId && document.getElementById(targetId);
      if (!target) {
        return;
      }

      target.scrollIntoView({ behavior: 'smooth', block: 'center' });

      target.classList.add('checklist-highlight');
      setTimeout(() => target.classList.remove('checklist-highlight'), 1200);

      if (typeof target.focus === 'function') {
        target.focus({ preventScroll: true });
      }
    });
  }

  function renderTestResult(status, message) {
    const el = document.getElementById('test-results');
    if (!el) {
      return;
    }

    el.classList.remove('pass', 'fail');
    if (status === 'pass') {
      el.classList.add('pass');
    }
    if (status === 'fail') {
      el.classList.add('fail');
    }
    el.textContent = message;
  }

  function formatApiErrorDetail(detail) {
    if (!detail) {
      return '';
    }

    if (typeof detail === 'string') {
      return detail;
    }

    if (Array.isArray(detail)) {
      return detail
        .map((item) => {
          if (typeof item === 'string') {
            return item;
          }
          if (item && typeof item === 'object') {
            const loc = Array.isArray(item.loc) ? item.loc.join('.') : '';
            const msg = item.msg || JSON.stringify(item);
            return loc ? `${loc}: ${msg}` : msg;
          }
          return String(item);
        })
        .join('; ');
    }

    if (typeof detail === 'object') {
      return detail.message || detail.msg || JSON.stringify(detail);
    }

    return String(detail);
  }

  function validateSourceCodeShape(sourceCode) {
    const lines = sourceCode.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      const isBlockHeader = /^(def|class|if|for|while|try|with|match|elif|else|except|finally)\b.*:\s*$/.test(trimmed);
      if (!isBlockHeader) {
        continue;
      }

      const currentIndent = line.match(/^\s*/)?.[0].length ?? 0;
      let foundBodyLine = false;

      for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
        const nextLine = lines[nextIndex];
        const nextTrimmed = nextLine.trim();

        if (!nextTrimmed || nextTrimmed.startsWith('#')) {
          continue;
        }

        const nextIndent = nextLine.match(/^\s*/)?.[0].length ?? 0;
        if (nextIndent <= currentIndent) {
          return {
            ok: false,
            message: `Indentation error near line ${index + 1}: "${trimmed}" has no indented body. Add an indented line below it, for example "    pass".`,
          };
        }

        foundBodyLine = true;
        break;
      }

      if (!foundBodyLine) {
        return {
          ok: false,
          message: `Indentation error near line ${index + 1}: "${trimmed}" has no body. Add at least one indented line below it.`,
        };
      }
    }

    return { ok: true };
  }

  async function runTeacherTests() {
    const testsInput = document.getElementById('tests-input');
    const runStatus = document.getElementById('run-status');
    const runBtn = document.getElementById('run-tests');
    const addToListBtn = document.getElementById('add-to-problem-list');

    if (!testsInput || !runStatus || !runBtn || !addToListBtn) {
      return;
    }

    testsPassed = false;
    updateAddToListState();

    const solutionList = document.querySelector('#solution-sortable ul');
    const hasSolutionBlocks = Boolean(solutionList && solutionList.children.length > 0);
    const sourceCode = hasSolutionBlocks && parsonsWidget
      ? parsonsWidget.solutionCode()
      : (draftPayload?.taskCode || '');
    const testsCode = testsInput.value.trim();

    if (!sourceCode.trim()) {
      renderTestResult('fail', 'No source code found to test. Drag blocks to the right column or add code in the first step.');
      return;
    }

    if (!testsCode) {
      renderTestResult('fail', 'Please add tests before running.');
      return;
    }

    const sourceValidation = validateSourceCodeShape(sourceCode);
    if (!sourceValidation.ok) {
      renderTestResult('fail', sourceValidation.message);
      return;
    }

    runBtn.disabled = true;
    runStatus.textContent = 'Running tests...';

    const python = [
      sourceCode,
      '',
      testsCode,
      '',
      'print("ALL_TEACHER_TESTS_PASSED")',
    ].join('\n');

    try {
      const { results, error } = await new FiniteWorker(python);
      if (error) {
        const parsedError = processTestError(error, 0, []);
        const renderedError = [parsedError.header, parsedError.details].filter(Boolean).join('\n\n');
        renderTestResult('fail', renderedError || 'An unknown error occurred during test execution.');
        testsPassed = false;
        updateAddToListState();
      } else {
        const output = (results || '').toString().trim();
        if (output.includes('ALL_TEACHER_TESTS_PASSED')) {
          renderTestResult('pass', 'All tests passed!');
          testsPassed = true;
          updateAddToListState();
        } else {
          const errorMessage = output || 'Test execution failed with no output.';
          renderTestResult('fail', errorMessage);
          testsPassed = false;
          updateAddToListState();
        }
      }
    } catch (err) {
      renderTestResult('fail', `Execution error: ${err.message || err}`);
      testsPassed = false;
      updateAddToListState();
    } finally {
      runBtn.disabled = false;
      runStatus.textContent = '';
    }
  }

  function addToProblemList() {
    const taskTitleInput = document.getElementById('task-title');
    const descriptionInput = document.getElementById('problem-description');
    const startDescriptionInput = document.getElementById('start-description');
    const customErrorMessagesInput = document.getElementById('custom-error-messages');
    const testsInput = document.getElementById('tests-input');
    const visibilityInput = document.getElementById('task-visibility-public');
    const taskTypeInput = document.getElementById('task-type');
    const solutionList = document.querySelector('#solution-sortable ul');

    if (!taskTitleInput || !descriptionInput || !startDescriptionInput || !testsInput || !solutionList || !parsonsWidget) {
      alert('Missing required fields to add the problem.');
      return;
    }

    const taskTitle = taskTitleInput.value.trim();
    const description = descriptionInput.value.trim();
    const startDescription = startDescriptionInput.value.trim();
    const customErrorMessages = customErrorMessagesInput.value.trim() || '';
    const tests = testsInput.value.trim();
    const solutionCode = modelAnswerCode;
    const isPublic = visibilityInput ? !visibilityInput.checked : true;
    const taskType = taskTypeInput ? taskTypeInput.value : 'normal';

    saveMetaToSession(taskTitle, description, startDescription, tests, customErrorMessages, isPublic, taskType);

    if (!taskTitle || !description || !startDescription || !tests || !solutionCode) {
      alert('Please ensure all required fields are filled out and set a model answer before adding the problem.');
      return;
    }

    if (!hasOpenedStudentPreview) {
      alert('Please open "Preview" before adding the problem to the list.');
      return;
    }

    if (!testsPassed) {
      alert('Please run tests successfully before adding the problem to the list.');
      return;
    }

    const solutionCodeWithBlanks = getSolutionCodeWithBlanks();
    const problemData = {
      taskTitle,
      description,
      startDescription,
      customErrorMessages,
      tests,
      solutionCode: solutionCodeWithBlanks,
      modelAnswerCode: solutionCode,
      parsonsRepr: buildCustomRepr(),
      task_type: taskType,
      is_public: isPublic,
    };

    const editTaskId = draftPayload?.taskId || null;
    const fetchUrl = editTaskId ? `/api/problems/${editTaskId}` : '/api/problems';
    const fetchMethod = editTaskId ? 'PUT' : 'POST';

    fetch(fetchUrl, {
      method: fetchMethod,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(problemData),
    })
      .then(async (response) => {
        if (response.ok) {
          alert(editTaskId ? 'Task updated successfully!' : 'Problem successfully added to the problem list!');
          window.location.href = '/teacher-dashboard';
        } else {
          let detail = '';
          let parsedDetail = '';
          try {
            const payload = await response.json();
            parsedDetail = formatApiErrorDetail(payload?.detail);
            detail = parsedDetail ? `\nReason: ${parsedDetail}` : '';
          } catch (parseError) {
            detail = '';
          }

          saveMetaToSession(
            taskTitleInput.value,
            descriptionInput.value,
            startDescriptionInput.value,
            testsInput.value,
            customErrorMessagesInput.value,
            getVisibilityValue(),
            getTaskTypeValue()
          );
          taskTitleInput.focus();

          alert(`Failed to add the problem.${detail}`);
        }
      })
      .catch((error) => {
        console.error('Error adding problem:', error);
        alert('An error occurred while adding the problem.');
      });
  }

  function saveCodeToSession() {
    const testsInput = document.getElementById('tests-input');
    const solutionList = document.querySelector('#solution-sortable ul');
    const hasSolutionBlocks = Boolean(solutionList && solutionList.children.length > 0);
    const currentCode = hasSolutionBlocks && parsonsWidget
      ? parsonsWidget.solutionCode()
      : (draftPayload?.taskCode || '');
    const currentTests = testsInput ? testsInput.value : (draftPayload?.taskTests || '');
    const currentTaskType = getTaskTypeValue();

    localStorage.setItem('create_task_draft_code', currentCode);
    localStorage.setItem('create_task_draft_tests', currentTests);

    if (draftPayload) {
      const updatedDraft = {
        ...draftPayload,
        taskCode: currentCode,
        taskTests: currentTests,
        taskType: currentTaskType,
        savedAt: new Date().toISOString(),
      };

      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(updatedDraft));
    }
  }

  function setupButtons() {
    const backBtn = document.getElementById('back-to-code');
    const clearBtn = document.getElementById('clear-blocks');
    const addCustomBtn = document.getElementById('add-custom-block');
    const addToListBtn = document.getElementById('add-to-problem-list');
    const addCustomErrorBtn = document.getElementById('add-custom-error-messages');
    const customBlockInput = document.getElementById('custom-block-input');
    const customErrorMessagesInput = document.getElementById('custom-error-messages');
    const taskTitleInput = document.getElementById('task-title');
    const descriptionInput = document.getElementById('problem-description');
    const startDescriptionInput = document.getElementById('start-description');
    const testsInput = document.getElementById('tests-input');
    const visibilityInput = document.getElementById('task-visibility-public');
    const taskTypeInput = document.getElementById('task-type');
    const runBtn = document.getElementById('run-tests');
    const setModelAnswerBtn = document.getElementById('set-model-answer');
    const previewStudentBtn = document.getElementById('preview-student-view');
    const cancelBtn = document.getElementById('cancel-task-editor');

    if (backBtn) {
      backBtn.addEventListener('click', () => {
        saveCodeToSession();
        const backTaskId = draftPayload?.taskId;
        window.location.href = backTaskId ? `/create-task?task_id=${backTaskId}` : '/create-task';
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        const confirmed = window.confirm(
          'Are you sure you want to cancel? All changes will be lost.'
        );
        if (!confirmed) {
          return;
        }
        window.location.href = '/teacher-dashboard';
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (!confirm('Are you sure you want to clear all blocks? This cannot be undone.')) {
          return;
        }
        sessionStorage.removeItem(BLOCKS_KEY);
        sessionStorage.removeItem(BLOCKS_SOURCE_KEY);
        sessionStorage.removeItem(META_KEY);
        sessionStorage.removeItem(META_SOURCE_KEY);
        sessionStorage.removeItem(MODEL_ANSWER_KEY);
        sessionStorage.removeItem(MODEL_ANSWER_REPR_KEY);
        sessionStorage.removeItem(MODEL_ANSWER_SOURCE_KEY);
        sessionStorage.removeItem(MODEL_ANSWER_UPDATED_AT_KEY);
        modelAnswerCode = '';
        modelAnswerRepr = '';
        modelAnswerUpdatedAt = '';
        hasOpenedStudentPreview = false;
        testsPassed = false;
        renderParsonsBoard(normalizeSourceCode(draftPayload?.taskCode || ''));
        updateModelAnswerStatus();
        updateAddToListState();

        const descriptionInput = document.getElementById('problem-description');
        const startDescriptionInput = document.getElementById('start-description');
        const testsInput = document.getElementById('tests-input');
        const customErrorMessagesInput = document.getElementById('custom-error-messages');
        const taskTitleInput = document.getElementById('task-title');
        if (taskTitleInput) {
          taskTitleInput.value = extractDefaultTitleFromCode(draftPayload?.taskCode || '');
        }
        if (descriptionInput) {
          descriptionInput.value = '';
        }
        if (startDescriptionInput) {
          startDescriptionInput.value = '';
        }
        if (testsInput) {
          testsInput.value = draftPayload?.taskTests || '';
        }
        if (customErrorMessagesInput) {
          customErrorMessagesInput.value = draftPayload?.customErrorMessages || '';
        }
        if (customErrorMessagesInput) {
          customErrorMessagesInput.value = '';
        }
      });
    }

    if (setModelAnswerBtn) {
      setModelAnswerBtn.addEventListener('click', () => {
        if (!parsonsWidget) {
          return;
        }

        const currentSolutionCode = parsonsWidget.solutionCode().trim();
        if (!currentSolutionCode) {
          alert('Move at least one block to the right column before setting the model answer.');
          return;
        }

        saveModelAnswerToSession(currentSolutionCode, parsonsWidget.reprCode());
        hasOpenedStudentPreview = false;
        updateAddToListState();
      });
    }

    if (previewStudentBtn) {
      previewStudentBtn.addEventListener('click', () => {
        openStudentPreview();
      });
    }

    if (addCustomBtn && customBlockInput) {
      addCustomBtn.addEventListener('click', () => {
        const customCode = customBlockInput.value.trimEnd();
        if (!customCode.trim()) {
          customBlockInput.focus();
          return;
        }

        addCustomBlockToSource(customCode);
        customBlockInput.value = '';
        customBlockInput.focus();
      });

      customBlockInput.addEventListener('keydown', (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault();
          addCustomBtn.click();
        }
      });
    }

    if (taskTitleInput && descriptionInput && startDescriptionInput && testsInput) {
      taskTitleInput.addEventListener('input', () => {
        hasOpenedStudentPreview = false;
        saveMetaToSession(
          taskTitleInput.value,
          descriptionInput.value,
          startDescriptionInput.value,
          testsInput.value,
          customErrorMessagesInput.value,
          getVisibilityValue(),
          getTaskTypeValue()
        );
        updateAddToListState();
      });

      descriptionInput.addEventListener('input', () => {
        hasOpenedStudentPreview = false;
        saveMetaToSession(
          taskTitleInput.value,
          descriptionInput.value,
          startDescriptionInput.value,
          testsInput.value,
          customErrorMessagesInput.value,
          getVisibilityValue(),
          getTaskTypeValue()
        );
        updateAddToListState();
      });

      startDescriptionInput.addEventListener('input', () => {
        hasOpenedStudentPreview = false;
        saveMetaToSession(
          taskTitleInput.value,
          descriptionInput.value,
          startDescriptionInput.value,
          testsInput.value,
          customErrorMessagesInput.value,
          getVisibilityValue(),
          getTaskTypeValue()
        );
        updateAddToListState();
      });

      testsInput.addEventListener('input', () => {
        hasOpenedStudentPreview = false;
        testsPassed = false;
        saveMetaToSession(
          taskTitleInput.value,
          descriptionInput.value,
          startDescriptionInput.value,
          testsInput.value,
          customErrorMessagesInput.value,
          getVisibilityValue(),
          getTaskTypeValue()
        );
        if (draftPayload) {
          draftPayload.taskTests = testsInput.value;
          sessionStorage.setItem('create_task_draft_payload', JSON.stringify(draftPayload));
        }
        updateAddToListState();
      });
    }

    if (taskTypeInput) {
      taskTypeInput.addEventListener('change', () => {
        hasOpenedStudentPreview = false;
        saveMetaToSession(
          taskTitleInput?.value || '',
          descriptionInput?.value || '',
          startDescriptionInput?.value || '',
          testsInput?.value || '',
          customErrorMessagesInput?.value || '',
          getVisibilityValue(),
          getTaskTypeValue()
        );
        if (draftPayload) {
          draftPayload.taskType = getTaskTypeValue();
          sessionStorage.setItem('create_task_draft_payload', JSON.stringify(draftPayload));
        }
        updateAddToListState();
      });
    }

    if (visibilityInput) {
      visibilityInput.addEventListener('change', () => {
        hasOpenedStudentPreview = false;
        saveMetaToSession(
          taskTitleInput?.value || '',
          descriptionInput?.value || '',
          startDescriptionInput?.value || '',
          testsInput?.value || '',
          customErrorMessagesInput?.value || '',
          getVisibilityValue(),
          getTaskTypeValue()
        );
        updateVisibilityWarning();
        updateAddToListState();
      });
    }

    if (runBtn) {
      runBtn.addEventListener('click', () => {
        runTeacherTests();
      });
    }

    if (addToListBtn) {
      addToListBtn.addEventListener('click', () => {
        addToProblemList();
      });
    }

    if (addCustomErrorBtn && customErrorMessagesInput) {
      addCustomErrorBtn.addEventListener('click', () => {
        // customErrorMessagesInput.focus();
        hasOpenedStudentPreview = false;
        testsPassed = false;
        saveMetaToSession(
          taskTitleInput.value,
          descriptionInput.value,
          startDescriptionInput.value,
          testsInput.value,
          customErrorMessagesInput.value,
          getVisibilityValue(),
          getTaskTypeValue()
        );
        updateAddToListState();
      });
    }
  }

  async function initializeBuilder() {
    const urlParams = new URLSearchParams(window.location.search);
    const urlTaskId = urlParams.get('task_id') ? parseInt(urlParams.get('task_id'), 10) : null;

    const taskTitleInput = document.getElementById('task-title');
    const descriptionInput = document.getElementById('problem-description');
    const startDescriptionInput = document.getElementById('start-description');
    const testsInput = document.getElementById('tests-input');
    const customErrorMessagesInput = document.getElementById('custom-error-messages');
    const visibilityInput = document.getElementById('task-visibility-public');
    const taskTypeInput = document.getElementById('task-type');

    if (urlTaskId) {
      // Direct edit mode: load task from API, model answer on right, leftover blocks on left
      let taskData;
      try {
        const [editableResp, taskResp] = await Promise.all([
          fetch(`/api/problems/${urlTaskId}/editable`),
          fetch(`/api/tasks/${urlTaskId}`),
        ]);

        if (!taskResp.ok) {
          alert('Task not found. Redirecting to dashboard.');
          window.location.href = '/teacher-dashboard';
          return;
        }
        taskData = await taskResp.json();

        if (editableResp.ok) {
          const { editable } = await editableResp.json();
          if (!editable) {
            alert('This task cannot be edited because it is used in a task set with enrolled students, or another teacher has added it to their task set.');
            window.location.href = '/teacher-dashboard';
            return;
          }
        }
      } catch (e) {
        alert('Failed to load task. Redirecting to dashboard.');
        window.location.href = '/teacher-dashboard';
        return;
      }

      const solutionCode = taskData.correct_solution?.solution_code || '';
      const teacherTests = taskData.correct_solution?.teacher_tests || '';

      draftPayload = {
        taskCode: solutionCode,
        taskTests: teacherTests,
        taskType: taskData.task_type || 'normal',
        savedAt: new Date().toISOString(),
        taskId: urlTaskId,
      };

      const cachedRepr = getCachedParsonsRepr(solutionCode);
      const meta = loadMetaFromSession(solutionCode, urlTaskId);
      const defaultTitle = extractDefaultTitleFromCode(solutionCode);
      const initialText = cachedRepr || buildReprFromBlocks(taskData);

      let instructions = {};
      try { instructions = JSON.parse(taskData.task_instructions || '{}'); } catch (e) { instructions = {}; }
      if (taskTitleInput) taskTitleInput.value = (meta.taskTitle || '').trim() || taskData.title || defaultTitle;
      if (descriptionInput) descriptionInput.value = meta.description || instructions.task_instructions || '';
      if (startDescriptionInput) startDescriptionInput.value = meta.startDescription || taskData.description || '';
      if (testsInput) testsInput.value = meta.tests || teacherTests || '';
      if (customErrorMessagesInput) customErrorMessagesInput.value = meta.customErrorMessages || taskData.correct_solution?.custom_error_messages || '';
      if (taskTypeInput) taskTypeInput.value = meta.isValid ? (meta.taskType || taskData.task_type || 'normal') : (taskData.task_type || 'normal');
      if (visibilityInput) {
        visibilityInput.checked = (meta.taskTitle ? meta.isPublic : taskData.is_public) === false;
      }

      const savedModelAnswer = loadModelAnswerFromSession(solutionCode);
      if (savedModelAnswer.code) {
        modelAnswerCode = savedModelAnswer.code;
        modelAnswerRepr = savedModelAnswer.repr;
        modelAnswerUpdatedAt = savedModelAnswer.updatedAt;
      } else {
        saveModelAnswerToSession(solutionCode, '');
      }

      if (visibilityInput) {
        const hasSessionMeta = sessionStorage.getItem(META_KEY) !== null;
        const isPublic = hasSessionMeta ? meta.isPublic : (typeof taskData.is_public === 'boolean' ? taskData.is_public : true);
        visibilityInput.checked = !isPublic;
        updateVisibilityWarning();
      }

      const addToListBtn = document.getElementById('add-to-problem-list');
      if (addToListBtn) addToListBtn.textContent = 'Update Task';

      const backBtn = document.getElementById('back-to-code');
      if (backBtn) backBtn.style.display = 'none';

      renderParsonsBoard(initialText);
      setupGuideToggle();
      setupPreviewModal();
      setupChecklistNavigation();
      setupButtons();
      updateModelAnswerStatus();
      updateAddToListState();
      return;
    }

    // Normal create/edit-via-step-1 mode
    const draft = readDraftPayload();
    if (!draft) {
      alert('No draft task found. Redirecting to task editor.');
      window.location.href = '/create-task';
      return;
    }

    draftPayload = draft;
    const editTaskId = draft.taskId || null;
    const cachedRepr = getCachedParsonsRepr(draft.taskCode);
    const meta = loadMetaFromSession(draft.taskCode, editTaskId);

    const defaultTitle = extractDefaultTitleFromCode(draft.taskCode);
    let initialText = cachedRepr || normalizeSourceCode(draft.taskCode);
    let fetchedFromApi = false;
    let apiTaskData = null;

    if (editTaskId && !cachedRepr) {
      try {
        const response = await fetch(`/api/tasks/${editTaskId}`);
        if (response.ok) {
          apiTaskData = await response.json();
          initialText = buildReprFromBlocks(apiTaskData);
          fetchedFromApi = true;
        }
      } catch (e) {
        console.error('Failed to fetch task for editing:', e);
      }
    }
    if (fetchedFromApi && !meta.taskTitle) {
      let instructions = {};
      try { instructions = JSON.parse(apiTaskData.task_instructions || '{}'); } catch (e) { instructions = {}; }
      if (taskTitleInput) taskTitleInput.value = apiTaskData.title || defaultTitle;
      if (descriptionInput) descriptionInput.value = instructions.task_instructions || '';
      if (startDescriptionInput) startDescriptionInput.value = apiTaskData.description || '';
      if (testsInput) testsInput.value = apiTaskData.correct_solution?.teacher_tests || draft.taskTests || '';
      if (customErrorMessagesInput) customErrorMessagesInput.value = apiTaskData.correct_solution?.custom_error_messages || '';
      if (taskTypeInput) taskTypeInput.value = apiTaskData.task_type || draft.taskType || 'normal';
      const savedAnswer = apiTaskData.correct_solution?.solution_code || '';
      if (savedAnswer) saveModelAnswerToSession(savedAnswer, '');
    } else {
      if (taskTitleInput) taskTitleInput.value = (meta.taskTitle || '').trim() || defaultTitle;
      if (descriptionInput) descriptionInput.value = meta.description || '';
      if (startDescriptionInput) startDescriptionInput.value = meta.startDescription || '';
      if (testsInput) testsInput.value = draft.taskTests || meta.tests || '';
      if (customErrorMessagesInput) customErrorMessagesInput.value = meta.customErrorMessages || '';
      if (taskTypeInput) taskTypeInput.value = meta.isValid ? (meta.taskType || draft.taskType || 'normal') : (draft.taskType || 'normal');

      const savedModelAnswer = loadModelAnswerFromSession(draft.taskCode);
      modelAnswerCode = savedModelAnswer.code;
      modelAnswerRepr = savedModelAnswer.repr;
      modelAnswerUpdatedAt = savedModelAnswer.updatedAt;
    }

    if (visibilityInput) {
      const hasSessionMeta = sessionStorage.getItem(META_KEY) !== null;
      const isPublic = hasSessionMeta ? meta.isPublic : (fetchedFromApi && apiTaskData ? apiTaskData.is_public : true);
      visibilityInput.checked = !isPublic;
      updateVisibilityWarning();
    }

    if (editTaskId) {
      const addToListBtn = document.getElementById('add-to-problem-list');
      if (addToListBtn) addToListBtn.textContent = 'Update Task';
    }
    renderParsonsBoard(initialText);
    setupGuideToggle();
    setupPreviewModal();
    setupChecklistNavigation();
    setupButtons();
    updateModelAnswerStatus();
    updateAddToListState();
  }

  document.addEventListener('DOMContentLoaded', initializeBuilder);
})();

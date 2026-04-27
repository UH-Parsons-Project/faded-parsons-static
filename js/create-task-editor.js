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
    if (!addToListBtn) {
      return;
    }

    addToListBtn.disabled = !(testsPassed && hasOpenedStudentPreview);
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
    const previewSource = document.getElementById('preview-source-sortable');
    const previewSolution = document.getElementById('preview-solution-sortable');
    const previewWrittenTests = document.getElementById('preview-written-tests');
    const previewModelAnswer = document.getElementById('preview-model-answer');
    const taskTitleInput = document.getElementById('task-title');
    const descriptionInput = document.getElementById('problem-description');
    const startDescriptionInput = document.getElementById('start-description');
    const testsInput = document.getElementById('tests-input');
    const ParsonsWidgetCtor = window.ParsonsWidget;

    if (!modal || !previewTaskTitle || !previewStartIntro || !previewText || !previewSource || !previewSolution || !previewWrittenTests || !previewModelAnswer || !parsonsWidget || !ParsonsWidgetCtor) {
      return;
    }

    const taskTitle = taskTitleInput?.value.trim() || 'No task name provided yet.';
    const startIntro = startDescriptionInput?.value.trim() || 'No start page intro provided yet.';
    const problemStatement = descriptionInput?.value.trim() || 'No problem statement provided yet.';
    previewTaskTitle.innerHTML = escapeHtml(taskTitle).replace(/\n/g, '<br>');
    previewStartIntro.innerHTML = escapeHtml(startIntro).replace(/\n/g, '<br>');
    previewText.innerHTML = escapeHtml(problemStatement).replace(/\n/g, '<br>');
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

  function loadMetaFromSession(sourceCode) {
    try {
      const raw = sessionStorage.getItem(META_KEY);
      const rawSource = sessionStorage.getItem(META_SOURCE_KEY);
      const normalizedSource = normalizeSourceCode(sourceCode || '');

      if (!raw) {
        return { taskTitle: '', description: '', startDescription: '', tests: '', customErrorMessages: '' };
      }

      if (typeof rawSource !== 'string' || rawSource !== normalizedSource) {
        return { taskTitle: '', description: '', startDescription: '', tests: '', customErrorMessages: '' };
      }

      const parsed = JSON.parse(raw);
      return {
        taskTitle: typeof parsed.taskTitle === 'string' ? parsed.taskTitle : '',
        description: typeof parsed.description === 'string' ? parsed.description : '',
        startDescription: typeof parsed.startDescription === 'string' ? parsed.startDescription : '',
        tests: typeof parsed.tests === 'string' ? parsed.tests : '',
        customErrorMessages: typeof parsed.customErrorMessages === 'string' ? parsed.customErrorMessages : '',
      };
    } catch (error) {
      console.error('Failed to parse builder metadata cache:', error);
      return { taskTitle: '', description: '', startDescription: '', tests: '', customErrorMessages: '' };
    }
  }

  function saveMetaToSession(taskTitle, description, startDescription, tests, customErrorMessages) {
    sessionStorage.setItem(META_KEY, JSON.stringify({ taskTitle, description, startDescription, tests, customErrorMessages }));
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

    const nextIndex = parsonsWidget.modified_lines.length;
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

    saveMetaToSession(taskTitle, description, startDescription, tests, customErrorMessages);

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
      type: solutionCodeWithBlanks.includes('!BLANK') ? 'faded' : 'normal',
    };

    fetch('/api/problems', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(problemData),
    })
      .then(async (response) => {
        if (response.ok) {
          alert('Problem successfully added to the problem list!');
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

          saveMetaToSession(taskTitleInput.value, descriptionInput.value, startDescriptionInput.value, testsInput.value, customErrorMessagesInput.value);
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

    localStorage.setItem('create_task_draft_code', currentCode);
    localStorage.setItem('create_task_draft_tests', currentTests);

    if (draftPayload) {
      const updatedDraft = {
        ...draftPayload,
        taskCode: currentCode,
        taskTests: currentTests,
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
    const runBtn = document.getElementById('run-tests');
    const setModelAnswerBtn = document.getElementById('set-model-answer');
    const previewStudentBtn = document.getElementById('preview-student-view');

    if (backBtn) {
      backBtn.addEventListener('click', () => {
        saveCodeToSession();
        window.location.href = '/create-task';
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
        saveMetaToSession(taskTitleInput.value, descriptionInput.value, startDescriptionInput.value, testsInput.value, customErrorMessagesInput.value);
        updateAddToListState();
      });

      descriptionInput.addEventListener('input', () => {
        hasOpenedStudentPreview = false;
        saveMetaToSession(taskTitleInput.value, descriptionInput.value, startDescriptionInput.value, testsInput.value, customErrorMessagesInput.value);
        updateAddToListState();
      });

      startDescriptionInput.addEventListener('input', () => {
        hasOpenedStudentPreview = false;
        saveMetaToSession(taskTitleInput.value, descriptionInput.value, startDescriptionInput.value, testsInput.value, customErrorMessagesInput.value);
        updateAddToListState();
      });

      testsInput.addEventListener('input', () => {
        hasOpenedStudentPreview = false;
        testsPassed = false;
        saveMetaToSession(taskTitleInput.value, descriptionInput.value, startDescriptionInput.value, testsInput.value, customErrorMessagesInput.value);
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
        saveMetaToSession(taskTitleInput.value, descriptionInput.value, startDescriptionInput.value, testsInput.value, customErrorMessagesInput.value);
        updateAddToListState();
      });
    }
  }

  function initializeBuilder() {
    const draft = readDraftPayload();
    if (!draft) {
      alert('No draft task found. Redirecting to task editor.');
      window.location.href = '/create-task';
      return;
    }

    draftPayload = draft;
    const cachedRepr = getCachedParsonsRepr(draft.taskCode);
    const initialText = cachedRepr || normalizeSourceCode(draft.taskCode);

    const meta = loadMetaFromSession(draft.taskCode);
    const taskTitleInput = document.getElementById('task-title');
    const descriptionInput = document.getElementById('problem-description');
    const startDescriptionInput = document.getElementById('start-description');
    const testsInput = document.getElementById('tests-input');
    const customErrorMessagesInput = document.getElementById('custom-error-messages');

    const defaultTitle = extractDefaultTitleFromCode(draft.taskCode);
    if (taskTitleInput) {
      taskTitleInput.value = (meta.taskTitle || '').trim() || defaultTitle;
    }

    if (descriptionInput) {
      descriptionInput.value = meta.description || '';
    }
    if (startDescriptionInput) {
      startDescriptionInput.value = meta.startDescription || '';
    }
    if (testsInput) {
      testsInput.value = meta.tests || draft.taskTests || '';
    }
    if (customErrorMessagesInput) {
      customErrorMessagesInput.value = meta.customErrorMessages || '';
    }

    const savedModelAnswer = loadModelAnswerFromSession(draft.taskCode);
    modelAnswerCode = savedModelAnswer.code;
    modelAnswerRepr = savedModelAnswer.repr;
    modelAnswerUpdatedAt = savedModelAnswer.updatedAt;

    renderParsonsBoard(initialText);
    setupGuideToggle();
    setupPreviewModal();
    setupButtons();
    updateModelAnswerStatus();
    updateAddToListState();
  }

  document.addEventListener('DOMContentLoaded', initializeBuilder);
})();

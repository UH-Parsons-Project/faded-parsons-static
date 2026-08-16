import { escapeHtml } from '../utils/ui-utils.js';

let previewParsonsWidget = null;

/**
 * Open interactive task preview in modal
 * @param {Object} taskListItem - Task object with id property
 */
export async function openTaskPreview(taskListItem) {
	try {
		const response = await fetch(`/api/tasks/${taskListItem.id}`, { credentials: 'include' });
		if (!response.ok) {
			throw new Error('Failed to load task details');
		}
		const task = await response.json();

		const modal = document.getElementById('student-preview-modal');
		const previewTaskTitle = document.getElementById('preview-task-title');
		const previewStartIntro = document.getElementById('preview-start-intro');
		const previewText = document.getElementById('preview-problem-text');
		const previewSource = document.getElementById('preview-source-sortable');
		const previewSolution = document.getElementById('preview-solution-sortable');
		const previewWrittenTests = document.getElementById('preview-written-tests');
		const previewModelAnswer = document.getElementById('preview-model-answer');

		if (!modal) {
			console.error('Preview modal not found.');
			return;
		}

		const startIntro = task.description || '';
		let problemStatement = '';
		try {
			const instr = JSON.parse(task.task_instructions || '{}');
			const baseText = instr.task_instructions || '';
			problemStatement = escapeHtml(baseText).replace(/\n/g, '<br>');
			if (instr.function_name) {
				problemStatement = `<strong>${escapeHtml(instr.function_name)}</strong><br>` + problemStatement;
			}
			if (instr.examples) {
				problemStatement += `<br><br><strong>Examples:</strong><pre style="margin-top: 0.5rem; background: #f1f5f9; padding: 0.75rem; border-radius: 6px;"><code>${escapeHtml(instr.examples)}</code></pre>`;
			}
		} catch (e) {
			problemStatement = escapeHtml(task.task_instructions || '').replace(/\n/g, '<br>');
		}

		const tests = task.correct_solution?.teacher_tests || '';
		const modelAnswerCode = task.model_answer || '';

		previewTaskTitle.innerHTML = escapeHtml(task.title || '').replace(/\n/g, '<br>');
		previewStartIntro.innerHTML = escapeHtml(startIntro).replace(/\n/g, '<br>');
		previewText.innerHTML = problemStatement;
		previewWrittenTests.textContent = tests.trim() || 'No tests written yet.';
		previewModelAnswer.textContent = modelAnswerCode.trim() || 'No model answer set yet.';

		previewSource.innerHTML = '';
		previewSolution.innerHTML = '';

		if (window.ParsonsWidget) {
			previewParsonsWidget = new window.ParsonsWidget({
				sortableId: previewSolution,
				trashId: previewSource,
				max_wrong_lines: 10,
				feedback_cb: false,
				can_indent: true,
				lang: 'en',
			});

			previewParsonsWidget.id_prefix = 'preview-sortable-codeline';

			const blocks = task.code_blocks?.blocks || [];
			const solutionCode = (task.correct_solution?.solution_code || '').replace(/\r\n/g, '\n');
			const modelAnswer = (task.model_answer || '').replace(/\r\n/g, '\n');
			const INDENT = '    ';

			const solLinesList = solutionCode.split('\n').map((l) => l.trimRight());
			const ansLinesList = modelAnswer.split('\n').map((l) => l.trimRight());

			const solLines = solLinesList.map((solLine, idx) => ({
				solLine,
				ansLine: ansLinesList[idx] || '',
				matched: false,
			}));

			const previewRepr = blocks.map((block) => {
				const codeWithBlanks = block.code.replace(/___/g, '!BLANK');
				const indented = INDENT.repeat(block.indent) + block.code;

				const matchItem = solLines.find((item) => {
					if (item.matched) return false;
					return item.solLine.replace(/!BLANK/g, '___') === indented;
				});

				if (matchItem) {
					matchItem.matched = true;
				}

				return codeWithBlanks;
			}).join('\n');

			previewParsonsWidget.init(previewRepr);

			const previewSolutionIds = previewParsonsWidget.studentGiven ? previewParsonsWidget.studentGiven.map((line) => line.id) : [];
			const previewSolutionSet = new Set(previewSolutionIds);
			const previewSourceIds = previewParsonsWidget.modified_lines
				.filter((line) => !previewSolutionSet.has(line.id))
				.map((line) => line.id);

			previewParsonsWidget.createHTMLFromLists(previewSolutionIds, previewSourceIds);
		}

		modal.classList.add('open');
		modal.setAttribute('aria-hidden', 'false');
		document.body.style.overflow = 'hidden';
	} catch (error) {
		console.error('Error previewing task:', error);
		alert('Could not load task preview.');
	}
}

/**
 * Setup modal close listeners for student preview modal
 */
export function setupPreviewModalClose() {
	const closeBtn = document.getElementById('close-student-preview');
	const modal = document.getElementById('student-preview-modal');

	function closeModal() {
		if (modal) {
			modal.classList.remove('open');
			modal.setAttribute('aria-hidden', 'true');
			document.body.style.overflow = '';
		}
	}

	if (closeBtn) {
		closeBtn.addEventListener('click', closeModal);
	}

	if (modal) {
		modal.addEventListener('click', (event) => {
			if (event.target === modal) {
				closeModal();
			}
		});
	}
}

// Import custom modules
import {get, set} from './user-storage.js'; // Local storage for user data persistence
import {
	prepareCode, // Prepares code for testing
	processTestResults, // Processes test results
	processTestError, // Handles test errors
} from './doctest-grader.js';
import './problem-element.js'; // Problem UI web component
import {FiniteWorker} from './worker-manager.js'; // Worker process for Python code execution

// Local storage key suffixes for saving user state
const LS_REPR = '-repr';
const LS_MOVES = '-moves';
const LS_EDITS = '-edits';

// Returns a localStorage key scoped to both taskset and task,
// preventing cross-taskset state bleed for shared tasks.
const lsKey = (suffix) => `${globalUniqueLinkCode}-${globalTaskId}${suffix}`;

// Global reference to the current problem element
let probEl;

// Global variable to store task ID for local storage operations
let globalTaskId;

// Global variable to store unique_link_code for API calls
let globalUniqueLinkCode;

// Global teacher tests for custom tasks (if present)
let globalTeacherTests = '';

// Initializes the problem widget. Called when the page loads.
export async function initWidget() {
	// Extract the task ID from URL path (e.g., /set/starter-list/tasks/1)
	// or from URL parameters (e.g., ?id=1) for backwards compatibility
	let params = new URL(document.location).searchParams;
	globalTaskId = params.get('id');

	// If no query parameter, try extracting from URL path
	if (!globalTaskId) {
		const pathParts = window.location.pathname.split('/').filter(p => p);
		// Path format: set/unique_link_code/tasks/task_id
		if (pathParts.length >= 4 && pathParts[2] === 'tasks') {
			globalTaskId = pathParts[3];
			globalUniqueLinkCode = pathParts[1];
		}
	}

	if (!globalTaskId) {
		document.getElementById('problem-wrapper').innerHTML =
			'<p>Error: No task ID provided</p>';
		return;
	}

	try {
		// Fetch task from API
		const taskApiUrl = globalUniqueLinkCode
			? `/api/sets/${globalUniqueLinkCode}/tasks/${globalTaskId}`
			: `/api/tasks/${globalTaskId}`;
		const response = await fetch(taskApiUrl);

		if (!response.ok) {
			throw new Error(`Failed to fetch task: ${response.statusText}`);
		}

		const task = await response.json();

		// Parse task instructions JSON
		let parsedInstructions = {};
		try {
			parsedInstructions =
				typeof task.task_instructions === 'string'
					? JSON.parse(task.task_instructions)
					: task.task_instructions;
		} catch (e) {
			// Fallback if task_instructions is not valid JSON
			parsedInstructions = {
				function_name: '',
				task_instructions: task.task_instructions || '',
				examples: '',
			};
		}

		// Build HTML problem statement from structured parts
		let problemStatementHTML = '';
		if (parsedInstructions.function_name) {
			problemStatementHTML += `<strong>${parsedInstructions.function_name}</strong>`;
		}
		if (parsedInstructions.task_instructions) {
			problemStatementHTML += ` ${parsedInstructions.task_instructions}`;
		}
		if (parsedInstructions.examples) {
			problemStatementHTML += `<br><pre><code>${parsedInstructions.examples}</code></pre>`;
		}

		const codeBlocksData = task.code_blocks;
		const functionHeader = codeBlocksData.function_header;
		globalTeacherTests = task?.correct_solution?.teacher_tests || '';

		// Reconstruct code lines from blocks for display
		let codeLines = reconstructCodeLines(codeBlocksData.blocks);

		// Add debug print statements and blank lines
		codeLines =
			codeLines +
			"\nprint('DEBUG:', !BLANK)" +
			"\nprint('DEBUG:', !BLANK)" +
			'\n# !BLANK' +
			'\n# !BLANK';

		// Create a new problem-element web component
		probEl = document.createElement('problem-element');

		// Set component attributes
		probEl.setAttribute('name', globalTaskId);
		probEl.setAttribute('taskInstructions', problemStatementHTML);
		probEl.setAttribute('description', task.description);
		probEl.setAttribute('codeLines', codeLines);
		probEl.setAttribute('codeHeader', functionHeader);
		probEl.setAttribute('runStatus', 'Loading Pyodide...');

		// Restore any unsent moves/edits from a previous session
		const savedMoves = JSON.parse(get(lsKey(LS_MOVES), '[]'));
		const savedEdits = JSON.parse(get(lsKey(LS_EDITS), '[]'));
		if (savedMoves.length > 0) probEl.recordedMoves = savedMoves;
		if (savedEdits.length > 0) probEl.recordedEdits = savedEdits;

		// Restore saved arrangement (JSON with stable block IDs) if available.
		// Set as a property so firstUpdated() can apply it after a fresh init,
		// keeping sortable-codelineN IDs consistent with the replay's initial_blocks.
		const savedArrangementJson = get(lsKey(LS_REPR));
		if (savedArrangementJson) {
			try {
				probEl.savedArrangement = JSON.parse(savedArrangementJson);
			} catch (e) {
				// Ignore malformed or old-format data
			}
		}

		// Listen for 'run' event fired when user clicks the Run button
		probEl.addEventListener('run', (e) => {
			handleSubmit(e.detail.code, e.detail.repr, e.detail.moves, e.detail.edits, functionHeader, globalTeacherTests);
		});

		// Save arrangement and move/edit history to localStorage on every change
		probEl.addEventListener('arrangement-changed', (e) => {
			if (e.detail.arrangement) {
				set(lsKey(LS_REPR), JSON.stringify(e.detail.arrangement));
			}
			set(lsKey(LS_MOVES), JSON.stringify(probEl.recordedMoves));
			set(lsKey(LS_EDITS), JSON.stringify(probEl.recordedEdits));
		});

		// Activate the run button
		probEl.setAttribute('enableRun', 'enableRun');
		probEl.setAttribute('runStatus', '');

		// Add component to the DOM
		document.getElementById('problem-wrapper').appendChild(probEl);
	} catch (error) {
		document.getElementById(
			'problem-wrapper'
		).innerHTML = `<p>Error loading task: ${error.message}</p>`;
	}
}

// Reconstructs code lines from structured blocks
// blocks: array of block objects with code, indent, faded properties
function reconstructCodeLines(blocks) {
	let lines = [];

	for (const block of blocks) {
		// Add proper indentation
		const indent = '    '.repeat(block.indent);
		let code = indent + block.code;

		// Convert ___ to !BLANK for Parsons widget to recognize editable fields
		code = code.replace(/___/g, '!BLANK');

		// Add #Ngiven marker if this block is pre-filled (given)
		if (block.given) {
			code += ' #0given';
		}

		lines.push(code);
	}

	return lines.join('\n');
}

// Handles submitted code by running tests and processing results
// submittedCode: the code written by the user
// reprCode: visual representation of user code (for storage)
// moves: array of move events recorded during the attempt
// edits: array of blank field edit events recorded during the attempt
// codeHeader: Python function template/header
async function handleSubmit(submittedCode, reprCode, moves, edits, codeHeader, teacherTests) {
	// Prepare code and inject test code
	let testResults = prepareCode(submittedCode, codeHeader, teacherTests);

	// If preparation succeeded, execute the code
	if (testResults.code) {
		try {
			const code = testResults.code;

			// Execute code in a separate worker process (Pyodide)
			const {results, error} = await new FiniteWorker(code);

			// Process results or errors
			if (typeof results === 'string') {
				testResults = processTestResults(results);
			} else {
				testResults = processTestError(error, testResults.startLine);
			}
		} catch (e) {
			// Log error to console
			console.warn(
				`Error in pyodideWorker at ${e.filename}, Line: ${e.lineno}, ${e.message}`
			);
			testResults = {
				status: 'fail',
				header: 'Unexpected error occurred',
				details: e.message || 'An unknown error occurred while running tests.',
			};
		}
	}

	if (!testResults || !testResults.status) {
		testResults = {
			status: 'fail',
			header: 'Unexpected error occurred',
			details: 'No test result was produced.',
		};
	}

	// Update UI with test results
	probEl.setAttribute('runStatus', ''); // Clear loading status
	probEl.setAttribute('resultsStatus', testResults.status); // Pass/Fail
	probEl.setAttribute('resultsHeader', testResults.header); // Result title
	probEl.setAttribute('resultsDetails', testResults.details); // Result details

	// Clear the pending moves/edits buffer (arrangement was already saved on last move)
	set(lsKey(LS_MOVES), '[]');
	set(lsKey(LS_EDITS), '[]');

	try {
		const resultData = {
			task_id: parseInt(globalTaskId),
			success: testResults.status === 'pass',
			submitted_code: submittedCode,
			test_output: testResults.details || '',
			repr_code: reprCode,
			moves: moves || [], // Include recorded moves with the submission
		edits: edits || [] // Include recorded blank edits with the submission
		};

		const response = await fetch(`/api/sets/${globalUniqueLinkCode}/tasks/${globalTaskId}/submit-result`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(resultData)
		});

		if (response.ok) {
			await response.json();
			// Clean up the start time from localStorage after successful submission
			localStorage.removeItem(`task_${globalTaskId}_start_time`);
		} else {
			console.warn('Failed to save test results:', response.statusText);
		}
	} catch (error) {
		console.warn('Error saving test results to backend:', error);
	}
}
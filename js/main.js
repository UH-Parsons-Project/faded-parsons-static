// Import custom modules
import {get, set} from './user-storage.js'; // Local storage for user data persistence
import {
	prepareCode, // Prepares code for testing
	processTestResults, // Processes test results
	processTestError, // Handles test errors
} from './doctest-grader.js';
import './problem-element.js'; // Problem UI web component
import {FiniteWorker} from './worker-manager.js'; // Worker process for Python code execution

// Local storage key for saving user code representation
const LS_REPR = '-repr';

// Global reference to the current problem element
let probEl;

// Global variable to store task ID for local storage operations
let globalTaskId;

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
		}
	}

	if (!globalTaskId) {
		document.getElementById('problem-wrapper').innerHTML =
			'<p>Error: No task ID provided</p>';
		return;
	}

	try {
		// Fetch task from API
		const response = await fetch(`/api/tasks/${globalTaskId}`);

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

		// Reconstruct code lines from blocks for display
		let codeLines = reconstructCodeLines(codeBlocksData.blocks);

		// Add debug print statements and blank lines
		codeLines =
			codeLines +
			"\nprint('DEBUG:', !BLANK)" +
			"\nprint('DEBUG:', !BLANK)" +
			'\n# !BLANK' +
			'\n# !BLANK';

		// Check if user has previously saved code in local storage
		const localRepr = get(globalTaskId + LS_REPR);
		if (localRepr) {
			// If saved code exists, use it instead of the default
			codeLines = localRepr;
		}

		// Create a new problem-element web component
		probEl = document.createElement('problem-element');

		// Set component attributes
		probEl.setAttribute('name', globalTaskId);
		probEl.setAttribute('taskInstructions', problemStatementHTML);
		probEl.setAttribute('description', task.description);
		probEl.setAttribute('codeLines', codeLines);
		probEl.setAttribute('codeHeader', functionHeader);
		probEl.setAttribute('runStatus', 'Loading Pyodide...');

		// Listen for 'run' event fired when user clicks the Run button
		probEl.addEventListener('run', (e) => {
			handleSubmit(e.detail.code, e.detail.repr, functionHeader);
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
// codeHeader: Python function template/header
async function handleSubmit(submittedCode, reprCode, codeHeader) {
	// Prepare code and inject test code
	let testResults = prepareCode(submittedCode, codeHeader);

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

	// Save user code locally for next time
	set(probEl.getAttribute('name') + LS_REPR, reprCode);

	try {
    // Get start time from localStorage
    const startTime = localStorage.getItem(`task-${globalTaskId}-start-time`);
    
    const resultData = {
        task_id: parseInt(globalTaskId),
        success: testResults.status === 'pass',
        submitted_code: submittedCode,
        test_output: testResults.details || '',
        repr_code: reprCode,
        start_time: startTime
    };

    const response = await fetch(`/api/tasks/${globalTaskId}/submit-result`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(resultData)
    });

    if (response.ok) {
        console.log('Test results saved to backend');
    } else {
        console.warn('Failed to save test results:', response.statusText);
    }
} catch (error) {
    console.warn('Error saving test results to backend:', error);
}
}

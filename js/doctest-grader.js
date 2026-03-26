function findNextUnindentedLine(lines, start) {
	/*
    Finds the next piece of unindented code in the file. Ignores empty lines and lines
    that start with a space or tab. Returns len(lines) if no unindented line found.
    */
	let lineNum = start;
	while (lineNum < lines.length) {
		const line = lines[lineNum];
		if (!(line == '' || line[0] == ' ' || line[0] == '\t' || line[0] == '\n')) {
			break;
		}
		lineNum++;
	}
	return lineNum;
}

function countDocstringLines(lines) {
	let startLine = -1;
	let inDocstring = false;
	lines.forEach((line, i) => {
		if (line.trim().includes('"""')) {
			if (inDocstring) {
				startLine = i + 1;
				return;
			}
			inDocstring = true;
		}
	});
	return startLine;
}

function extractError(error, numDocstringLines) {
	let startI = -1;
	let endI = -1;
	let lineNum;
	const errorLines = error.split('\n');
	for (var i = errorLines.length - 1; i >= 0; i--) {
		let line = errorLines[i];
		if (line.startsWith('SyntaxError') || line.startsWith('IndentationError')) {
			endI = i;
		} else if (line.includes('File "<exec>", line')) {
			lineNum = parseInt(line.split(', line ')[1], 10);
			lineNum -= numDocstringLines - 1;
			startI = i;
			break;
		}
	}
	if (startI == -1 || endI == -1) {
		return 'No error report found.';
	} else {
		return (
			`Error at line ${lineNum}:\n` +
			errorLines.slice(startI + 1, endI + 1).join('\n')
		);
	}
}

function cleanupDoctestResults(resultsStr) {
	let keptLines = [];
	let inKeepRange = false;
	resultsStr.split('\n').forEach((line) => {
		if (line.startsWith('File "__main__"')) {
			inKeepRange = true;
			return;
		} else if (
			line.startsWith('Trying:') ||
			line.startsWith('1 items had no tests:')
		) {
			inKeepRange = false;
		}
		if (inKeepRange) {
			line = line.replace('Failed example:', '\n❌ Failed example:');
			keptLines.push(line);
		}
	});
	return keptLines.join('\n');
}

export function prepareCode(submittedCode, codeHeader) {
	submittedCode += '\n';
	let lines = codeHeader.split('\n');
	const startLine = countDocstringLines(lines);
	const codeLines = submittedCode.split('\n');
	if (!(codeLines[0].includes('def') || codeLines[0].includes('class'))) {
		return {
			status: 'fail',
			header: 'Error running tests',
			details: 'First code line must be `def` or `class` declaration',
		};
	}
	// Remove function def or class declaration statement, its relied on elsewhere
	codeLines.shift();

	let line = findNextUnindentedLine(codeLines, 0);
	if (line != codeLines.length) {
		return {
			status: 'fail',
			header: 'Error running tests',
			details:
				'All lines in a function or class definition should be indented at least once. It looks like you have a line that has no indentation.',
		};
	}
	const linesToPreserve = lines.slice(0, startLine);
	const endOfReplaceLines = findNextUnindentedLine(lines, startLine);
	const extraLinesToPreserve = lines.slice(endOfReplaceLines);
	let finalCode = [];
	linesToPreserve.forEach((line) => {
		finalCode.push(line);
	});
	codeLines.forEach((line) => {
		finalCode.push(line);
	});
	extraLinesToPreserve.forEach((line) => {
		finalCode.push(line);
	});
	// Runs the doctests
	finalCode.push('import doctest');
	finalCode.push('doctest.testmod(verbose=True)');
	finalCode = finalCode.join('\n');

	return {
		status: 'success',
		header: 'Running tests...',
		code: finalCode,
		startLine: startLine,
	};
}

export function processTestResults(outputStr) {
	const summaryRe = /(\d+)\spassed\sand\s(\d+)\sfailed./;
	const summaryMatches = outputStr.match(summaryRe);
	if (summaryMatches) {
		const successCount = parseInt(summaryMatches[1], 10);
		const failCount = parseInt(summaryMatches[2], 10);
		const totalCount = successCount + failCount;
		const doctestResults = cleanupDoctestResults(outputStr);
		return {
			status: successCount == totalCount ? 'pass' : 'fail',
			header: `${successCount} of ${totalCount} tests passed`,
			details: doctestResults,
		};
	}

	return {
		status: 'fail',
		header: 'Unable to parse test results',
		details: outputStr || 'No test output received.',
	};
}

export function processTestError(error, startLine) {
	const message = error?.message || '';

	if (message.startsWith('Traceback')) {
		return {
			status: 'fail',
			header: 'Syntax error',
			details: extractError(message, startLine),
		};
	} else if (message == 'Infinite loop') {
		return {
			status: 'fail',
			header: 'Infinite loop',
			details:
				'Your code did not finish executing within 60 seconds. Please look to see if you accidentally coded an infinite loop.',
		};
	}
	return {
		status: 'fail',
		header: 'Unexpected error occurred',
		details: message || 'No error details were provided.',
	};
}

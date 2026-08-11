/* global loadPyodide, importScripts */

importScripts('https://cdn.jsdelivr.net/pyodide/v0.21.1/full/pyodide.js');

async function loadPyodideAndRemember() {
	self.pyodide = await loadPyodide();
}
let pyodideReadyPromise = loadPyodideAndRemember();

self.onmessage = async (event) => {
	await pyodideReadyPromise;
	const python = event.data;
	try {
		// Capture stdout and traceback in one payload so UI can show passed tests before failures.
		const captureCode = `
import sys
import json
import traceback
from io import StringIO
_old_stdout = sys.stdout
_captured = StringIO()
sys.stdout = _captured
_error = None
try:
	exec(${JSON.stringify(python)})
except Exception:
	_error = traceback.format_exc()
finally:
	sys.stdout = _old_stdout
json.dumps({"stdout": _captured.getvalue(), "error": _error})
`;
		const payload = await self.pyodide.runPythonAsync(captureCode);
		const parsed = JSON.parse(payload || '{}');
		const stdout = parsed?.stdout || '';
		const errorMessage = parsed?.error || '';

		if (errorMessage) {
			const combined = stdout ? `${stdout}\n${errorMessage}` : errorMessage;
			self.postMessage({
				error: {
					message: combined,
					name: 'PythonError',
				},
			});
			return;
		}

		self.postMessage({results: stdout});
	} catch (error) {
		self.postMessage({
			error: {
				message: error?.message || String(error),
				name: error?.name || 'Error',
			},
		});
	}
};

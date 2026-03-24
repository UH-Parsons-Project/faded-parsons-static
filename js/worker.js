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
		// Capture stdout by redirecting sys.stdout
		const captureCode = `
import sys
from io import StringIO
_old_stdout = sys.stdout
_captured = StringIO()
sys.stdout = _captured
try:
	exec(${JSON.stringify(python)})
finally:
	sys.stdout = _old_stdout
_captured.getvalue()
`;
		let results = await self.pyodide.runPythonAsync(captureCode);
		self.postMessage({results});
	} catch (error) {
		self.postMessage({error: error});
	}
};

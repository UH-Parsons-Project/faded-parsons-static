import {LitElement, html} from 'lit';

export class TestResultsElement extends LitElement {
	static properties = {
		status: {type: String},
		header: {type: String},
		details: {type: String},
		source: {type: String},
	};

	createRenderRoot() {
		return this;
	}

	renderDetails() {
		const details = this.details || '';
		const lines = details.split('\n');

		return lines.map((line, index) => {
			let lineClass = 'test-details-line';
			if (line.startsWith('✅')) {
				lineClass += ' test-details-line-pass';
			} else if (line.startsWith('❌')) {
				lineClass += ' test-details-line-fail';
			}

			return html`<div class=${lineClass}>${line}</div>`;
		});
	}

	render() {
		const header = this.header || '';
		const summaryMatch = header.match(/^(\d+) of (\d+) tests passed$/i);
		let summaryVariant = 'unknown';
		if (summaryMatch) {
			const passedCount = Number(summaryMatch[1]);
			const totalCount = Number(summaryMatch[2]);
			if (passedCount > 0 && passedCount === totalCount) {
				summaryVariant = 'full-pass';
			} else if (passedCount > 0) {
				summaryVariant = 'partial-pass';
			} else {
				summaryVariant = 'no-pass';
			}
		} else if ((this.status || '').toLowerCase() === 'fail') {
			summaryVariant = 'no-pass';
		} else if ((this.status || '').toLowerCase() === 'pass') {
			summaryVariant = 'full-pass';
		}
		const summaryClass = [
			'test-result-summary',
			summaryVariant,
		]
			.filter(Boolean)
			.join(' ');
		const isTeacherMessage = (this.source || '').toLowerCase() === 'teacher';

		return html`<div class="test-results-panel">
					<div class=${summaryClass}>
						${this.header}
						${isTeacherMessage
							? html`<span class="badge badge-info ml-2" title="Shown from teacher custom error rules">Teacher hint</span>`
							: ''}
					</div>
					<div class="test-results-details">${this.renderDetails()}</div>
				</div>`;
	}
}

customElements.define('test-results-element', TestResultsElement);

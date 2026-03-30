import {LitElement, html} from 'lit';

export class TestResultsElement extends LitElement {
	static properties = {
		status: {type: String},
		header: {type: String},
		details: {type: String},
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

			return html`${index > 0 ? '\n' : ''}<span class=${lineClass}>${line}</span>`;
		});
	}

	render() {
		return html`<div class="testcase ${this.status}">
						<span class="msg">${this.header}</span>
						</div>
						<pre><code>${this.renderDetails()}</code></pre></div>
					</div>`;
	}
}

customElements.define('test-results-element', TestResultsElement);

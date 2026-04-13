/* global ParsonsWidget */

// Lit web component base + templating and styling utilities
import {LitElement, html, css} from 'lit';
// Allows rendering HTML strings safely for trusted content
import {unsafeHTML} from 'lit/directives/unsafe-html.js';
// Ref helpers to access rendered DOM nodes
import {ref, createRef} from 'lit/directives/ref.js';

import './loader-element.js';
import './test-results-element.js';

// ProblemElement: UI wrapper for a single Parsons problem.
// Responsibilities:
// - Present problem description
// - Render two sortable code areas (starter & solution)
// - Handle Run action and emit a 'run' event with code payload
export class ProblemElement extends LitElement {
	static properties = {
		name: {type: String},
		attemptId: {type: String},
		taskInstructions: {type: String},
		description: {type: String},
		codeLines: {type: String},
		codeHeader: {type: String},
		isLoading: {type: Boolean},
		enableRun: {type: Boolean, default: false},
		runStatus: {type: String},
		resultsStatus: {type: String},
		resultsHeader: {type: String},
		resultsDetails: {type: String},
	};

	static styles = css`
		/* Layout proportions for the two Parsons columns within the widget */
		.starter {
			width: 40%;
		}
		.solution {
			width: 58%;
			margin-left: 2%;
		}
	`;

	// Refs to the container elements bound to the Parsons widget
	starterRef = createRef();
	solutionRef = createRef();

	// Array to store moves locally as they happen
	recordedMoves = [];

	// Array to store blank field edits locally as they happen
	recordedEdits = [];

	// Opt-out of Shadow DOM to allow existing CSS frameworks to style content
	createRenderRoot() {
		return this;
	}

	render() {
		// Default results placeholder until tests are run
		let results =
			'Test results will appear here after clicking "Run Tests" above.';
		const generalGuidance = html`
			<ul class="mb-0 pl-3">
				<li>Read the problem statement first and identify what the final program should do.</li>
				<li>Drag blocks from the left area into the solution area on the right.</li>
				<li>Use every gray block. Blue blocks are optional and can be ignored if not needed.</li>
				<li>Run tests often and use the feedback to fix ordering, indentation, or missing lines.</li>
				<li>When all tests pass, move on to the next task.</li>
			</ul>
		`;
		if (this.resultsStatus) {
			// Render the test results component with current status
			results = html`<test-results-element
				status=${this.resultsStatus}
				header=${this.resultsHeader}
				details=${this.resultsDetails}
			></test-results-element>`;
		}

		return html`

			<!-- Top row: problem statement + general guidance -->
			<div class="row mt-3 align-items-stretch">
				<div class="col-12 col-lg-9 mb-3 mb-lg-0">
					<div class="card h-100">
						<div class="card-header">
							<h3>Problem Statement</h3>
						</div>
						<div class="card-body">${unsafeHTML(this.taskInstructions)}</div>
					</div>
				</div>
				<div class="col-12 col-lg-3">
					<div class="card h-100">
						<div class="card-header">
							<h4>General Guidance</h4>
						</div>
						<div class="card-body">
							${generalGuidance}
						</div>
					</div>
				</div>
			</div>

			<!-- Content container with Parsons widget and test results side by side -->
			<div class="row mt-4 align-items-start">
				<!-- Parsons widget area: starter (trash) and solution columns -->
				<div class="col-12 col-lg-9 mb-4 mb-lg-0">
					<div class="card">
						<div class="card-body">
							<div
								${ref(this.starterRef)}
								class="sortable-code starter"
							></div>
							<div
								${ref(this.solutionRef)}
								class="sortable-code solution"
							></div>
							<div style="clear:both"></div>
							<div class="row float-right">
								<div class="col-sm-12">
									<span style="margin-right: 8px">
										${this.runStatus &&
										html`<loader-element></loader-element>`}
										${this.runStatus}
									</span>
									<button
										@click=${this.onRun}
										type="button"
										class="btn btn-primary"
										?disabled=${!this.enableRun}
									>
										Run Tests
									</button>
								</div>
							</div>
						</div>
					</div>
				</div>

				<!-- Right column: test results -->
				<div class="col-12 col-lg-3">
					<!-- Test results card -->
					<div class="card">
						<div class="card-header">
							<h4>Test Cases</h4>
						</div>
						<div id="test_description">
							<div class="card-body">${results}</div>
						</div>
					</div>
				</div>
			</div>
		`;
	}

	recordBlockMove = (moveData) => {
		// Store move locally instead of sending to server immediately
		this.recordedMoves.push(moveData);
		console.log('Move recorded locally:', moveData);
	};

	firstUpdated() {
		const getListName = (listEl) => {
			if (!listEl) {
				return 'unknown';
			}
			const parent = listEl.parentElement;
			if (!parent) {
				return 'unknown';
			}
			if (parent === this.solutionRef.value) {
				return 'solution';
			}
			if (parent === this.starterRef.value) {
				return 'starter';
			}
			return 'unknown';
		};

		const getCurrentLocation = (itemId) => {
			const itemEl = document.getElementById(itemId);
			if (!itemEl || !itemEl.parentElement) {
				return {list: 'unknown', index: -1};
			}
			const listEl = itemEl.parentElement;
			const index = Array.from(listEl.children).indexOf(itemEl);
			return {
				list: getListName(listEl),
				index,
			};
		};

		let pendingMove = null;

		// Initialize the Parsons widget with references to the two columns
		this.parsonsWidget = new ParsonsWidget({
			sortableId: this.solutionRef.value,
			trashId: this.starterRef.value,
			onSortableUpdate: () => {
				if (!pendingMove) {
					return;
				}
				const to = getCurrentLocation(pendingMove.id);
				const toIndent =
					this.parsonsWidget.getLineById(pendingMove.id)?.indent ?? 0;

				if (
					pendingMove.from.list === to.list &&
					pendingMove.from.index === to.index &&
					pendingMove.fromIndent === toIndent
				) {
					pendingMove = null;
					return;
				}

				// Record move locally for later submission with attempt
				this.recordBlockMove({
					block_id: pendingMove.id,
					from_container: pendingMove.from.list,
					to_container: to.list,
					from_index: pendingMove.from.index,
					to_index: to.index,
					from_indent: pendingMove.fromIndent,
					to_indent: toIndent,
					event_time: new Date().toISOString(),
				});

				pendingMove = null;
			},
		});
		// Load the initial code blocks into the widget
		this.parsonsWidget.init(this.codeLines);
		// Optional: sort blocks alphabetically for consistent starting state
		this.parsonsWidget.alphabetize();

		const sortableList = this.solutionRef.value?.querySelector('ul');
		const starterList = this.starterRef.value?.querySelector('ul');

		const attachMoveStartTracking = (listEl) => {
			if (!listEl) {
				return;
			}
			$(listEl).on('sortstart', (event, ui) => {
				const itemId = ui?.item?.[0]?.id;
				if (!itemId) {
					pendingMove = null;
					return;
				}
				pendingMove = {
					id: itemId,
					from: getCurrentLocation(itemId),
					fromIndent: this.parsonsWidget.getLineById(itemId)?.indent ?? 0,
				};
			});
		};

		attachMoveStartTracking(sortableList);
		attachMoveStartTracking(starterList);

		// Track text typed into !BLANK input fields via event delegation on both containers
		const debounceTimers = new Map();

		const recordEdit = (input) => {
			const li = input.closest('li[id]');
			if (!li) return;
			const blockId = li.id;
			const inputs = Array.from(li.querySelectorAll('input.text-box'));
			const blankIndex = inputs.indexOf(input);
			const value = input.value;

			// Skip if value unchanged from last recorded edit for this block+blank
			const key = `${blockId}:${blankIndex}`;
			const last = this.recordedEdits.findLast?.(e => e.block_id === blockId && e.blank_index === blankIndex);
			if (last && last.value === value) return;

			this.recordedEdits.push({
				block_id: blockId,
				blank_index: blankIndex,
				value,
				event_time: new Date().toISOString(),
			});
		};

		const attachEditTracking = (containerEl) => {
			if (!containerEl) return;

			containerEl.addEventListener('input', (event) => {
				if (!event.target.matches('input.text-box')) return;
				const input = event.target;
				const key = input.closest('li[id]')?.id + ':' + Array.from(input.closest('li[id]')?.querySelectorAll('input.text-box') ?? []).indexOf(input);
				clearTimeout(debounceTimers.get(key));
				debounceTimers.set(key, setTimeout(() => recordEdit(input), 500));
			});

			containerEl.addEventListener('blur', (event) => {
				if (!event.target.matches('input.text-box')) return;
				const input = event.target;
				const li = input.closest('li[id]');
				if (!li) return;
				const key = li.id + ':' + Array.from(li.querySelectorAll('input.text-box')).indexOf(input);
				clearTimeout(debounceTimers.get(key));
				recordEdit(input);
			}, true);
		};

		attachEditTracking(this.solutionRef.value);
		attachEditTracking(this.starterRef.value);
	}

	onRun() {
		// Update UI to show loading state and emit a 'run' event
		this.runStatus = 'Running code...';
		this.dispatchEvent(
			new CustomEvent('run', {
				detail: {
					// Full solution code assembled from sorted blocks
					code: this.parsonsWidget.solutionCode(),
					// Serializable block representation for persistence
					repr: this.parsonsWidget.reprCode(),
					// Include recorded moves to send with attempt
					moves: this.recordedMoves,
					// Include recorded blank edits to send with attempt
					edits: this.recordedEdits,
				},
			})
		);
		this.recordedMoves = [];
		this.recordedEdits = [];
	}
}

// Register the custom element for use in HTML
customElements.define('problem-element', ProblemElement);

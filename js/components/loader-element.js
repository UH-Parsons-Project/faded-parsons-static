import {LitElement, html, css} from 'lit';

export class LoaderElement extends LitElement {
	static styles = css`
		.loader {
			border: 4px solid #f3f3f3;
			border-radius: 50%;
			border-top: 4px solid #444444;
			width: 6px;
			height: 6px;
			animation: spin 1s linear infinite;
			display: inline-block;
		}

		@keyframes spin {
			100% {
				transform: rotate(360deg);
			}
		}
	`;

	render() {
		return html`<div class="loader"></div>`;
	}
}

customElements.define('loader-element', LoaderElement);

import { createPrivateBadge, isPrivateTask } from '../components/privacy-badge.js';
import { openTaskPreview } from './task-preview.js';

/**
 * Toggle task favorite status via backend API
 * @param {Object} task
 * @param {Function} [onUpdateCallback]
 */
export async function toggleFavorite(task, onUpdateCallback) {
	const shouldFavorite = !task.is_favorite;
	const response = await fetch(`/api/tasks/${encodeURIComponent(task.id)}/favorite`, {
		method: shouldFavorite ? 'POST' : 'DELETE',
		credentials: 'include',
	});

	if (!response.ok) {
		throw new Error('Failed to update favorite');
	}

	const result = await response.json();
	task.is_favorite = Boolean(result.is_favorite);
	if (typeof onUpdateCallback === 'function') {
		onUpdateCallback(task);
	}
}

/**
 * Create a standardized available task item element for task selection modals
 * @param {Object} task
 * @param {Object} options - { isSelected, onSelectionChange, onFavoriteToggle }
 * @returns {HTMLElement}
 */
export function createAvailableTaskElement(task, options = {}) {
	const { isSelected = false, onSelectionChange, onFavoriteToggle } = options;

	const taskEl = document.createElement('div');
	taskEl.className = 'task-item' + (isSelected ? ' selected' : '');

	const header = document.createElement('div');
	header.className = 'task-item-header';

	const title = document.createElement('div');
	title.className = 'task-item-title';
	title.textContent = task.title;

	const titleWrap = document.createElement('div');
	titleWrap.style.display = 'flex';
	titleWrap.style.alignItems = 'center';
	titleWrap.style.gap = '.45rem';
	titleWrap.style.minWidth = '0';
	titleWrap.appendChild(title);
	header.appendChild(titleWrap);

	const controlsWrap = document.createElement('div');
	controlsWrap.style.display = 'flex';
	controlsWrap.style.alignItems = 'center';
	controlsWrap.style.gap = '.2rem';
	controlsWrap.style.flexShrink = '0';

	const favoriteBtn = document.createElement('button');
	favoriteBtn.type = 'button';
	favoriteBtn.className = 'task-favorite-button' + (task.is_favorite ? ' is-favorite' : '');
	favoriteBtn.innerHTML = task.is_favorite ? '<i class="fas fa-star"></i>' : '<i class="far fa-star"></i>';
	favoriteBtn.title = task.is_favorite ? 'Remove from favorites' : 'Add to favorites';
	favoriteBtn.setAttribute('aria-label', favoriteBtn.title);
	favoriteBtn.addEventListener('click', async (e) => {
		e.preventDefault();
		e.stopPropagation();
		try {
			await toggleFavorite(task, onFavoriteToggle);
		} catch (error) {
			console.error('Failed to update favorite:', error);
			alert('Could not update favorite right now.');
		}
	});
	controlsWrap.appendChild(favoriteBtn);

	if (isPrivateTask(task)) {
		controlsWrap.appendChild(createPrivateBadge());
	}
	header.appendChild(controlsWrap);

	const checkbox = document.createElement('input');
	checkbox.type = 'checkbox';
	checkbox.setAttribute('aria-label', `Select task: ${task.title}`);
	checkbox.checked = isSelected;

	checkbox.addEventListener('change', (e) => {
		const checked = e.target.checked;
		if (checked) {
			taskEl.classList.add('selected');
		} else {
			taskEl.classList.remove('selected');
		}
		if (typeof onSelectionChange === 'function') {
			onSelectionChange(task.id, checked);
		}
	});

	const content = document.createElement('div');
	content.className = 'task-item-content';

	const type = document.createElement('div');
	type.className = 'task-item-type';
	type.textContent = `Type: ${task.task_type || ''}`;

	const createdBy = document.createElement('div');
	createdBy.className = 'task-item-meta';
	createdBy.textContent = `Created by: ${task.owner_username || task.creator_username || 'Unknown teacher'}`;

	content.appendChild(header);
	content.appendChild(type);
	content.appendChild(createdBy);

	const actions = document.createElement('div');
	actions.className = 'task-item-actions';

	const previewBtn = document.createElement('button');
	previewBtn.type = 'button';
	previewBtn.className = 'preview-btn';
	previewBtn.innerHTML = '<i class="fas fa-eye"></i> Preview';
	previewBtn.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		openTaskPreview(task);
	});

	actions.appendChild(previewBtn);

	taskEl.appendChild(checkbox);
	taskEl.appendChild(content);
	taskEl.appendChild(actions);

	taskEl.addEventListener('click', (e) => {
		if (e.target !== checkbox && !e.target.closest('.task-item-actions') && !e.target.closest('.task-favorite-button')) {
			checkbox.checked = !checkbox.checked;
			checkbox.dispatchEvent(new Event('change'));
		}
	});

	return taskEl;
}

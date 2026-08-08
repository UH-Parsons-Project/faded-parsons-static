export function isPrivateTask(task) {
	return Boolean(task && task.is_public === false);
}

export function createPrivateBadge() {
	const badge = document.createElement('span');
	badge.className = 'private-badge';
	badge.textContent = 'PRIVATE';
	badge.title = 'Private task';
	badge.setAttribute('aria-label', 'Private task');
	badge.style.display = 'inline-flex';
	badge.style.alignItems = 'center';
	badge.style.justifyContent = 'center';
	badge.style.padding = '0.14rem 0.45rem';
	badge.style.borderRadius = '999px';
	badge.style.border = '1px solid #d1d5db';
	badge.style.background = '#e5e7eb';
	badge.style.color = '#6b7280';
	badge.style.fontSize = '0.62rem';
	badge.style.fontWeight = '800';
	badge.style.lineHeight = '1';
	badge.style.letterSpacing = '0.08em';
	badge.style.whiteSpace = 'nowrap';
	badge.style.flexShrink = '0';
	return badge;
}

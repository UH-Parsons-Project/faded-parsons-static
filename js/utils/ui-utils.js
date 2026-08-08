export function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export function formatDate(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleDateString();
}

export function formatDateTime(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleString();
}

export function showError(message) {
    const errorEl = document.getElementById('error-message');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
    } else {
        alert(message);
    }
}

export function getRoleBadgeClass(role) {
    if (!role) return 'badge-light text-muted';
    switch (role.toLowerCase()) {
        case 'admin':
            return 'badge-warning';
        case 'teacher':
            return 'badge-info';
        case 'student':
            return 'badge-success';
        default:
            return 'badge-light text-muted';
    }
}

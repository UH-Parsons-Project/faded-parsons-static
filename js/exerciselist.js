import {clearAuth} from '/js/auth-utils.js';
import {initNavbarExercisesButton} from '/js/auth-ui.js';

// Display username if available
const username = localStorage.getItem('username');
if (username) {
    document.getElementById('user-name').textContent = username;
}

initNavbarExercisesButton();

// Set up logout button
document
    .getElementById('logout-btn')
    .addEventListener('click', async function () {
        // Call logout endpoint to clear cookie
        await fetch('/api/logout', {method: 'POST'});
        clearAuth();
        window.location.href = '/index.html';
    });

// Load exercise list
const container = document.getElementById('problems-list');

function render(list) {
    const ul = document.createElement('ul');
    list.forEach(function (item) {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = '/problem.html?id=' + encodeURIComponent(item.id);
        a.textContent = item.title;
        li.appendChild(a);
        if (item.category) {
            li.appendChild(document.createTextNode(' (' + item.category + ')'));
        }
        ul.appendChild(li);
    });
    container.innerHTML = '';
    container.appendChild(ul);
}

// Fetch problems list
fetch('/api/tasks')
    .then(function (resp) {
        if (!resp.ok) throw new Error('Network response not ok');
        return resp.json();
    })
    .then(function (json) {
        render(json);
    })
    .catch(function (error) {
        container.innerHTML = '<p>Unable to load exercise list.</p>';
    });

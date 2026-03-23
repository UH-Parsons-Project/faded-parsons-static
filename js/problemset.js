// Logout button
document.getElementById('logout-btn').addEventListener('click', async () => {
	await fetch('/api/student_logout', { method: 'POST' });
	localStorage.removeItem('nickname');
	const pathParts = window.location.pathname.split('/');
	const uniqueLinkCode = pathParts[2];
	window.location.href = `/set/${uniqueLinkCode}`;
});

// Load problem list for this problemset
const container = document.getElementById('problems-list');
const pathParts = window.location.pathname.split('/');
const uniqueLinkCode = pathParts[2]; // /set/{unique_link_code}/tasks

function render(list) {
	const ul = document.createElement('ul');
	list.forEach(function (item) {
		const li = document.createElement('li');
		const a = document.createElement('a');
		a.href = `/set/${uniqueLinkCode}/tasks/${item.id}/start`;
		a.textContent = item.title;
		li.appendChild(a);
		ul.appendChild(li);
	});
	container.innerHTML = '';
	container.appendChild(ul);
}

if (uniqueLinkCode) {
	// Fetch problems for this problemset
	fetch(`/api/problemsets/${uniqueLinkCode}/tasks`)
		.then(function (resp) {
			if (!resp.ok) throw new Error('Network response not ok');
			return resp.json();
		})
		.then(function (json) {
			render(json);
		})
		.catch(function (error) {
			container.innerHTML = '<p>Unable to load problems.</p>';
			console.error(error);
		});
} else {
	container.innerHTML = '<p>Problem set not found.</p>';
}
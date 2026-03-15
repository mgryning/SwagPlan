let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
    await SwagAuth.initializePage({
        showLogin: showLoginButton,
        showMain: showMainContent,
        onAuthenticated: async (user) => {
            currentUser = user;
        },
        onLoggedOut: () => {
            currentUser = null;
            showLoginButton();
        }
    });
});

function showLoginButton() {
    document.getElementById('login-section').style.display = 'block';
    document.getElementById('main-content').style.display = 'none';
    document.getElementById('top-bar').style.display = 'none';
    document.querySelector('.navigation').style.display = 'none';
}

function showMainContent() {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('main-content').style.display = 'block';
    document.getElementById('top-bar').style.display = 'flex';
    document.querySelector('.navigation').style.display = 'block';
}

function showSuccessMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message success-message';
    messageDiv.textContent = message;
    document.querySelector('.schedule-activity').insertBefore(messageDiv, document.getElementById('new-activity-form'));

    setTimeout(() => {
        messageDiv.remove();
    }, 3000);
}

function showErrorMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message error-message';
    messageDiv.textContent = message;
    document.querySelector('.schedule-activity').insertBefore(messageDiv, document.getElementById('new-activity-form'));

    setTimeout(() => {
        messageDiv.remove();
    }, 5000);
}

async function handleProtectedRequest(task, fallbackMessage) {
    try {
        await task();
    } catch (error) {
        console.error(fallbackMessage, error);

        if (error.status === 401) {
            SwagAuth.showAuthMessage('Your session expired. Please sign in again.', 'error');
            showLoginButton();
            return;
        }

        showErrorMessage(error.message || fallbackMessage);
    }
}

async function createActivity(title, date, responsible, notes) {
    await handleProtectedRequest(async () => {
        await SwagAuth.requestJson('/api/activities', {
            method: 'POST',
            body: JSON.stringify({
                title,
                date,
                responsible,
                notes
            })
        });

        showSuccessMessage('Activity created successfully!');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1500);
    }, 'Unable to create activity');
}

async function bulkCreateActivities(startMonth) {
    await handleProtectedRequest(async () => {
        const result = await SwagAuth.requestJson('/api/activities/bulk', {
            method: 'POST',
            body: JSON.stringify({ startMonth })
        });

        showSuccessMessage(`Successfully created ${result.created} activities!`);
        document.getElementById('bulk-schedule-form').reset();
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 2000);
    }, 'Unable to create activities');
}

document.getElementById('new-activity-form').addEventListener('submit', (event) => {
    event.preventDefault();

    const title = document.getElementById('activity-title').value.trim();
    const date = document.getElementById('activity-date').value;
    const responsible = document.getElementById('activity-responsible').value.trim();
    const notes = document.getElementById('activity-notes').value.trim();

    if (!title || !date) {
        showErrorMessage('Please fill in all required fields.');
        return;
    }

    createActivity(title, date, responsible, notes);
});

document.getElementById('bulk-schedule-form').addEventListener('submit', (event) => {
    event.preventDefault();

    const startMonth = document.getElementById('start-month').value;

    if (!startMonth) {
        showErrorMessage('Please select a starting month.');
        return;
    }

    if (!confirm('This will create 8 new activities. Are you sure?')) {
        return;
    }

    bulkCreateActivities(startMonth);
});

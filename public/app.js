let currentUser = null;
let activities = [];
let users = [];

document.addEventListener('DOMContentLoaded', async () => {
    await SwagAuth.initializePage({
        showLogin: showLoginButton,
        showMain: showMainContent,
        onAuthenticated: async (user) => {
            currentUser = user;
            await loadActivities();
        },
        onLoggedOut: () => {
            currentUser = null;
            activities = [];
            users = [];
            showLoginButton();
        }
    });
});

function showLoginButton() {
    document.getElementById('login-section').style.display = 'block';
    document.getElementById('main-content').style.display = 'none';
    document.getElementById('top-bar').style.display = 'none';
}

function showMainContent() {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('main-content').style.display = 'block';
    document.getElementById('top-bar').style.display = 'flex';
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

        alert(error.message || fallbackMessage);
    }
}

async function loadUsers() {
    users = await SwagAuth.requestJson('/api/users');
}

function getUserName(userId) {
    if (!userId) {
        return 'No one assigned';
    }

    if (currentUser && userId === currentUser.id) {
        return currentUser.name;
    }

    const user = users.find((entry) => entry.id === userId);
    if (user) {
        return user.name;
    }

    if (userId.length <= 40) {
        return userId;
    }

    return 'Someone';
}

async function loadActivities() {
    await handleProtectedRequest(async () => {
        await loadUsers();
        activities = await SwagAuth.requestJson('/api/activities');
        renderActivities();
    }, 'Unable to load activities');
}

function renderActivities() {
    const upcomingList = document.getElementById('upcoming-activities-list');
    const heldList = document.getElementById('held-activities-list');
    const overviewUpcomingCount = document.getElementById('overview-upcoming-count');
    const overviewOpenCount = document.getElementById('overview-open-count');
    const overviewHeldCount = document.getElementById('overview-held-count');
    const upcomingColumnCount = document.getElementById('upcoming-column-count');
    const heldColumnCount = document.getElementById('held-column-count');
    const overviewSummary = document.getElementById('overview-summary');

    const upcomingActivities = activities
        .filter((activity) => activity.status === 'planned')
        .sort((left, right) => new Date(left.date) - new Date(right.date));

    const heldActivities = activities
        .filter((activity) => activity.status === 'held' || activity.status === 'skipped')
        .sort((left, right) => new Date(right.date) - new Date(left.date))
        .slice(0, 5);

    const openResponsibilities = upcomingActivities.filter((activity) => !activity.responsible).length;
    const nextUpcoming = upcomingActivities[0];

    overviewUpcomingCount.textContent = String(upcomingActivities.length);
    overviewOpenCount.textContent = String(openResponsibilities);
    overviewHeldCount.textContent = String(heldActivities.length);
    upcomingColumnCount.textContent = String(upcomingActivities.length);
    heldColumnCount.textContent = String(heldActivities.length);

    if (nextUpcoming) {
        const nextDate = new Date(nextUpcoming.date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        overviewSummary.textContent = `${upcomingActivities.length} upcoming activities. Next up is ${nextUpcoming.title} on ${nextDate}.`;
    } else {
        overviewSummary.textContent = 'No upcoming plans yet. Schedule the first activity to start the board.';
    }

    if (activities.length === 0) {
        upcomingList.innerHTML = '<div class="empty-state">No upcoming activities. Create the first one!</div>';
        heldList.innerHTML = '<div class="empty-state">No held activities yet.</div>';
        return;
    }

    function renderActivityCard(activity) {
        const isParticipant = activity.participants.includes(currentUser.id);
        const isCurrentUserResponsible = activity.responsible === currentUser.id;
        const hasResponsiblePerson = activity.responsible && activity.responsible.trim() !== '';
        const responsibleName = getUserName(activity.responsible);
        const canManage = currentUser.isAdmin || isCurrentUserResponsible;
        const participantCount = activity.participants.length;

        const statusDisplay = activity.status === 'held'
            ? 'Held'
            : activity.status === 'skipped'
                ? 'Skipped'
                : 'Planned';
        const statusClass = activity.status === 'held'
            ? 'status-held'
            : activity.status === 'skipped'
                ? 'status-skipped'
                : 'status-planned';

        const dateObject = new Date(activity.date);
        const monthLabel = dateObject.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
        const dayLabel = dateObject.toLocaleDateString('en-US', { day: '2-digit' });
        const fullDateLabel = dateObject.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });

        return `
            <div class="activity-card ${activity.status === 'held' ? 'activity-held' : activity.status === 'skipped' ? 'activity-skipped' : ''} ${activity.status === 'planned' ? (hasResponsiblePerson ? 'has-responsible' : 'no-responsible') : ''}">
                <div class="activity-header">
                    <div class="activity-date-block">
                        <span class="activity-date-month">${monthLabel}</span>
                        <span class="activity-date-day">${dayLabel}</span>
                    </div>
                    <div class="activity-title-section">
                        <div class="activity-card-topline">
                            <span class="activity-flow-tag">${activity.status === 'planned' ? 'Plan' : 'Archive'}</span>
                            <span class="activity-participant-tag">${participantCount} ${participantCount === 1 ? 'person' : 'people'}</span>
                        </div>
                        <div class="activity-title">${activity.title}</div>
                        <div class="activity-subline">${fullDateLabel}</div>
                    </div>
                    <div class="activity-status">
                        <span class="status-badge ${statusClass}">
                            ${activity.status === 'held' ? '✅' : activity.status === 'skipped' ? '⏭️' : '📅'} ${statusDisplay}
                        </span>
                    </div>
                </div>

                <div class="activity-details">
                    <div class="activity-date">
                        <span class="detail-label">Schedule</span>
                        <span class="detail-text">${fullDateLabel}</span>
                    </div>

                    <div class="activity-responsible">
                        <span class="detail-label">Owner</span>
                        <span class="detail-text ${hasResponsiblePerson ? 'has-person' : 'no-person'}">
                            ${hasResponsiblePerson ? `${responsibleName} is responsible` : 'No one assigned yet'}
                        </span>
                    </div>

                    ${activity.notes ? `<div class="activity-notes">
                        <span class="detail-label">Notes</span>
                        <span class="detail-text">${activity.notes}</span>
                    </div>` : ''}
                </div>
                <div class="activity-actions">
                    ${isCurrentUserResponsible && activity.status === 'planned'
                        ? `<button class="btn btn-danger" onclick="leaveActivity('${activity.id}')"><span>👋</span> Leave</button>`
                        : (!hasResponsiblePerson && activity.status === 'planned'
                            ? `<button class="btn btn-primary" onclick="joinActivity('${activity.id}')"><span>🙋‍♂️</span> Take ownership</button>`
                            : '')
                    }
                    ${canManage && activity.status === 'planned'
                        ? `<button class="btn btn-secondary" onclick="markAsHeld('${activity.id}')"><span>✅</span> Mark held</button>
                           <button class="btn btn-warning" onclick="markAsSkipped('${activity.id}')"><span>⏭️</span> Skip</button>`
                        : ''
                    }
                    ${canManage && (activity.status === 'held' || activity.status === 'skipped')
                        ? `<button class="btn btn-primary" onclick="markAsPlanned('${activity.id}')"><span>📅</span> Reopen</button>`
                        : ''
                    }
                    ${currentUser.isAdmin
                        ? `<button class="btn btn-danger" onclick="deleteActivity('${activity.id}')"><span>🗑️</span> Delete</button>`
                        : ''
                    }
                </div>
            </div>
        `;
    }

    upcomingList.innerHTML = upcomingActivities.length === 0
        ? '<div class="empty-state">No upcoming activities. Create the first one!</div>'
        : upcomingActivities.map(renderActivityCard).join('');

    heldList.innerHTML = heldActivities.length === 0
        ? '<div class="empty-state">No held activities yet.</div>'
        : heldActivities.map(renderActivityCard).join('');
}

async function joinActivity(activityId) {
    await handleProtectedRequest(async () => {
        await SwagAuth.requestJson(`/api/activities/${activityId}/signup`, { method: 'POST' });
        await loadActivities();
    }, 'Unable to join activity');
}

async function leaveActivity(activityId) {
    await handleProtectedRequest(async () => {
        await SwagAuth.requestJson(`/api/activities/${activityId}/leave`, { method: 'POST' });
        await loadActivities();
    }, 'Unable to leave activity');
}

async function markAsHeld(activityId) {
    await handleProtectedRequest(async () => {
        await SwagAuth.requestJson(`/api/activities/${activityId}/mark-held`, { method: 'POST' });
        await loadActivities();
    }, 'Unable to mark activity as held');
}

async function markAsSkipped(activityId) {
    await handleProtectedRequest(async () => {
        await SwagAuth.requestJson(`/api/activities/${activityId}/mark-skipped`, { method: 'POST' });
        await loadActivities();
    }, 'Unable to mark activity as skipped');
}

async function markAsPlanned(activityId) {
    await handleProtectedRequest(async () => {
        await SwagAuth.requestJson(`/api/activities/${activityId}/mark-planned`, { method: 'POST' });
        await loadActivities();
    }, 'Unable to mark activity as planned');
}

async function deleteActivity(activityId) {
    if (!confirm('Are you sure you want to delete this activity?')) {
        return;
    }

    await handleProtectedRequest(async () => {
        await SwagAuth.requestJson(`/api/activities/${activityId}`, { method: 'DELETE' });
        await loadActivities();
    }, 'Unable to delete activity');
}

window.joinActivity = joinActivity;
window.leaveActivity = leaveActivity;
window.markAsHeld = markAsHeld;
window.markAsSkipped = markAsSkipped;
window.markAsPlanned = markAsPlanned;
window.deleteActivity = deleteActivity;

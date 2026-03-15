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
        const isCurrentUserResponsible = activity.responsible === currentUser.id;
        const hasResponsiblePerson = activity.responsible && activity.responsible.trim() !== '';
        const responsibleName = getUserName(activity.responsible);
        const canManage = currentUser.isAdmin || isCurrentUserResponsible;
        const participantCount = activity.participants.length;

        const statusDisplay = activity.status === 'held' ? 'Held'
            : activity.status === 'skipped' ? 'Skipped'
            : 'Planned';
        const statusClass = activity.status === 'held' ? 'status-held'
            : activity.status === 'skipped' ? 'status-skipped'
            : 'status-planned';

        const dateObject = new Date(activity.date);
        const monthLabel = dateObject.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
        const dayLabel = dateObject.toLocaleDateString('en-US', { day: '2-digit' });
        const weekdayLabel = dateObject.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();

        const ownerText = hasResponsiblePerson ? responsibleName : 'No owner';
        const ownerClass = hasResponsiblePerson ? 'meta-owner-assigned' : 'meta-owner-unassigned';

        const cardClasses = [
            'activity-card',
            activity.status === 'held' ? 'activity-held' : '',
            activity.status === 'skipped' ? 'activity-skipped' : '',
            activity.status === 'planned' ? (hasResponsiblePerson ? 'has-responsible' : 'no-responsible') : ''
        ].filter(Boolean).join(' ');

        const actionButtons = [];

        if (activity.status === 'planned') {
            if (isCurrentUserResponsible) {
                actionButtons.push(`<button class="btn btn-danger" onclick="leaveActivity('${activity.id}')">Leave</button>`);
            } else if (!hasResponsiblePerson) {
                actionButtons.push(`<button class="btn btn-primary" onclick="joinActivity('${activity.id}')">Take ownership</button>`);
            }
            if (canManage) {
                actionButtons.push(`<button class="btn btn-secondary" onclick="markAsHeld('${activity.id}')">Mark held</button>`);
                actionButtons.push(`<button class="btn btn-warning" onclick="markAsSkipped('${activity.id}')">Skip</button>`);
            }
        }

        if (canManage && (activity.status === 'held' || activity.status === 'skipped')) {
            actionButtons.push(`<button class="btn btn-primary" onclick="markAsPlanned('${activity.id}')">Reopen</button>`);
        }

        if (currentUser.isAdmin) {
            actionButtons.push(`<button class="btn btn-danger" onclick="deleteActivity('${activity.id}')">Delete</button>`);
        }

        return `
            <div class="${cardClasses}">
                <div class="activity-header">
                    <div class="activity-date-block">
                        <span class="activity-date-month">${monthLabel}</span>
                        <span class="activity-date-day">${dayLabel}</span>
                        <span class="activity-date-weekday">${weekdayLabel}</span>
                    </div>
                    <div class="activity-body">
                        <div class="activity-title">${activity.title}</div>
                        <div class="activity-meta">
                            <span class="${ownerClass}">${ownerText}</span>
                            <span class="meta-sep">·</span>
                            <span class="meta-participants">${participantCount} ${participantCount === 1 ? 'person' : 'people'}</span>
                        </div>
                        ${activity.notes ? `<p class="activity-note">${activity.notes}</p>` : ''}
                    </div>
                    <span class="status-badge ${statusClass}">${statusDisplay}</span>
                </div>
                ${actionButtons.length > 0 ? `<div class="activity-actions">${actionButtons.join('')}</div>` : ''}
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

function toggleArchiveColumn() {
    document.getElementById('archive-column').classList.toggle('collapsed');
}

window.toggleArchiveColumn = toggleArchiveColumn;
window.joinActivity = joinActivity;
window.leaveActivity = leaveActivity;
window.markAsHeld = markAsHeld;
window.markAsSkipped = markAsSkipped;
window.markAsPlanned = markAsPlanned;
window.deleteActivity = deleteActivity;

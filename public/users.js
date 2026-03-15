let currentUser = null;
let users = [];
let pendingUsers = [];

document.addEventListener('DOMContentLoaded', async () => {
    await SwagAuth.initializePage({
        requireAdmin: true,
        showLogin: showLoginButton,
        showMain: showMainContent,
        showAccessDenied,
        onAuthenticated: async (user) => {
            currentUser = user;
            await loadUsers();
        },
        onLoggedOut: () => {
            currentUser = null;
            users = [];
            pendingUsers = [];
            showLoginButton();
        }
    });
});

function showLoginButton() {
    document.getElementById('login-section').style.display = 'block';
    document.getElementById('main-content').style.display = 'none';
    document.getElementById('top-bar').style.display = 'none';
    document.getElementById('navigation').style.display = 'none';
    document.getElementById('access-denied').style.display = 'none';
}

function showAccessDenied() {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('main-content').style.display = 'none';
    document.getElementById('top-bar').style.display = 'flex';
    document.getElementById('navigation').style.display = 'none';
    document.getElementById('access-denied').style.display = 'block';
}

function showMainContent() {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('main-content').style.display = 'block';
    document.getElementById('top-bar').style.display = 'flex';
    document.getElementById('navigation').style.display = 'block';
    document.getElementById('access-denied').style.display = 'none';
}

function showFlashMessage(message, type = 'success') {
    const host = document.querySelector('.user-management');
    let messageDiv = document.getElementById('users-page-message');

    if (!messageDiv) {
        messageDiv = document.createElement('div');
        messageDiv.id = 'users-page-message';
        host.insertBefore(messageDiv, host.firstChild.nextSibling);
    }

    messageDiv.className = `message ${type === 'error' ? 'error-message' : 'success-message'}`;
    messageDiv.textContent = message;

    setTimeout(() => {
        messageDiv.remove();
    }, 4000);
}

function statusBadgeClass(status) {
    if (status === 'pending') {
        return 'pending-badge';
    }

    if (status === 'disabled') {
        return 'disabled-badge';
    }

    return '';
}

async function handleAdminRequest(task, fallbackMessage) {
    try {
        await task();
    } catch (error) {
        console.error(fallbackMessage, error);

        if (error.status === 401) {
            SwagAuth.showAuthMessage('Your session expired. Please sign in again.', 'error');
            showLoginButton();
            return;
        }

        if (error.status === 403) {
            showAccessDenied();
            return;
        }

        showFlashMessage(error.message || fallbackMessage, 'error');
    }
}

async function loadUsers() {
    await handleAdminRequest(async () => {
        const [allUsers, pending] = await Promise.all([
            SwagAuth.requestJson('/api/admin/users'),
            SwagAuth.requestJson('/api/admin/users/pending')
        ]);

        users = allUsers;
        pendingUsers = pending;
        renderPendingUsers();
        renderUsers();
    }, 'Unable to load users');
}

function renderPendingUsers() {
    const pendingList = document.getElementById('pending-users-list');
    const pendingCount = document.getElementById('pending-count');

    pendingCount.textContent = `${pendingUsers.length} waiting`;
    pendingCount.className = `status-chip ${pendingUsers.length > 0 ? 'pending-badge' : ''}`;

    if (pendingUsers.length === 0) {
        pendingList.innerHTML = '<div class="empty-state">No pending account requests.</div>';
        return;
    }

    pendingList.innerHTML = pendingUsers.map((user) => renderUserCard(user, true)).join('');
}

function renderUsers() {
    const usersList = document.getElementById('users-list');

    if (users.length === 0) {
        usersList.innerHTML = '<div class="empty-state">No users registered yet.</div>';
        return;
    }

    usersList.innerHTML = users.map((user) => renderUserCard(user, false)).join('');
}

function renderUserCard(user, isPendingSection) {
    const providerList = Array.isArray(user.authProviders) && user.authProviders.length > 0
        ? user.authProviders.join(', ')
        : 'none';
    const emailLabel = user.email || 'Not set';
    const approveLabel = user.status === 'disabled' ? 'Re-enable' : 'Approve';

    return `
        <div class="user-card" data-user-id="${user.id}">
            <div class="user-info">
                <div class="user-name">${user.name}</div>
                <div class="user-badges">
                    <span class="user-badge ${statusBadgeClass(user.status)}">${user.status}</span>
                    ${user.isAdmin ? '<span class="user-badge admin-badge">admin</span>' : ''}
                </div>
                <div class="user-provider-line">Providers: ${providerList}</div>
                <div class="user-facebook-id">Facebook ID: ${user.facebookId || 'Not linked'}</div>
                <div class="user-email-display">
                    Email: <span class="email-value">${emailLabel}</span>
                    <button class="btn-edit-email" onclick="editEmail('${user.id}')">Edit</button>
                </div>
                <div class="user-email-edit" style="display: none;">
                    <input type="email" class="email-input" value="${user.email || ''}" placeholder="Enter email address">
                    <button class="btn btn-primary btn-save" onclick="saveEmail('${user.id}')">Save</button>
                    <button class="btn btn-secondary btn-cancel" onclick="cancelEditEmail('${user.id}')">Cancel</button>
                </div>
                <div class="user-actions">
                    ${user.status !== 'approved' ? `<button class="btn btn-primary" onclick="approveUser('${user.id}')">${approveLabel}</button>` : ''}
                    ${!user.isAdmin && currentUser && currentUser.id !== user.id && user.status !== 'disabled' ? `<button class="btn btn-warning" onclick="disableUser('${user.id}')">Disable</button>` : ''}
                </div>
            </div>
        </div>
    `;
}

function getUserById(userId) {
    return users.find((user) => user.id === userId) || pendingUsers.find((user) => user.id === userId);
}

function editEmail(userId) {
    const userCard = document.querySelector(`[data-user-id="${userId}"]`);
    const displayDiv = userCard.querySelector('.user-email-display');
    const editDiv = userCard.querySelector('.user-email-edit');

    displayDiv.style.display = 'none';
    editDiv.style.display = 'flex';

    const input = editDiv.querySelector('.email-input');
    input.focus();
    input.select();
}

function cancelEditEmail(userId) {
    const userCard = document.querySelector(`[data-user-id="${userId}"]`);
    const displayDiv = userCard.querySelector('.user-email-display');
    const editDiv = userCard.querySelector('.user-email-edit');
    const user = getUserById(userId);

    displayDiv.style.display = 'flex';
    editDiv.style.display = 'none';
    editDiv.querySelector('.email-input').value = user?.email || '';
}

async function saveEmail(userId) {
    const userCard = document.querySelector(`[data-user-id="${userId}"]`);
    const input = userCard.querySelector('.email-input');
    const newEmail = input.value.trim();

    await handleAdminRequest(async () => {
        await SwagAuth.requestJson(`/api/users/${userId}`, {
            method: 'PUT',
            body: JSON.stringify({
                email: newEmail || null
            })
        });

        await loadUsers();
        showFlashMessage('Email updated successfully.');
    }, 'Unable to update email');
}

async function approveUser(userId) {
    await handleAdminRequest(async () => {
        await SwagAuth.requestJson(`/api/admin/users/${userId}/approve`, {
            method: 'POST'
        });

        await loadUsers();
        showFlashMessage('User approved successfully.');
    }, 'Unable to approve user');
}

async function disableUser(userId) {
    await handleAdminRequest(async () => {
        await SwagAuth.requestJson(`/api/admin/users/${userId}/disable`, {
            method: 'POST'
        });

        await loadUsers();
        showFlashMessage('User disabled successfully.');
    }, 'Unable to disable user');
}

window.editEmail = editEmail;
window.cancelEditEmail = cancelEditEmail;
window.saveEmail = saveEmail;
window.approveUser = approveUser;
window.disableUser = disableUser;

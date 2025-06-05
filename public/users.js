/* ===== CONFIG ===== */
const FB_APP_ID = '1249474143244692';
const FB_VERSION = 'v23.0';
/* ================== */

let currentUser = null;
let users = [];
let fbInitPromise;

// Load SDK and return a promise that resolves after FB.init
function loadFacebookSdk() {
    if (fbInitPromise) return fbInitPromise; // Idempotent
    
    fbInitPromise = new Promise((resolve, reject) => {
        // Called by the SDK when it is ready
        window.fbAsyncInit = () => {
            try {
                FB.init({
                    appId: FB_APP_ID,
                    cookie: true,
                    xfbml: false, // no need for XFBML if you do not use FB buttons
                    version: FB_VERSION
                });
                console.log('✅ Facebook SDK ready');
                resolve(); // <-- everything after this is safe
            } catch (e) {
                reject(e);
            }
        };

        // Inject the SDK script (if not already present)
        if (!document.getElementById('facebook-jssdk')) {
            const s = document.createElement('script');
            s.id = 'facebook-jssdk';
            s.src = `https://connect.facebook.net/en_US/sdk.js`;
            s.async = true;
            s.defer = true;
            s.crossOrigin = 'anonymous';
            s.onerror = () => reject(new Error('SDK download failed'));
            document.head.appendChild(s);
        }

        // Time-out in case FB is blocked
        setTimeout(() => reject(new Error('SDK load timeout')), 10000);
    });
    
    return fbInitPromise;
}

// Check for existing session first
document.addEventListener('DOMContentLoaded', async function() {
    const sessionUser = getSession();
    if (sessionUser) {
        currentUser = sessionUser;
        checkAccess();
        return;
    }
    
    // No local session – try Facebook
    try {
        await loadFacebookSdk(); // waits for FB.init
        FB.getLoginStatus(statusChangeCallback);
    } catch (err) {
        console.error('Facebook SDK load error:', err);
        showLoginButton(); // Offline fallback
    }
});

function statusChangeCallback(response) {
    console.log('FB status:', response.status);
    if (response.status === 'connected') {
        fetchUserInfo();
    } else {
        showLoginButton();
    }
}

function fetchUserInfo() {
    FB.api('/me', {fields: 'id,name,email'}, function(response) {
        if (!response || response.error) {
            console.error('FB /me error', response && response.error);
            showLoginButton();
            return;
        }
        currentUser = response;
        registerUser(response);
        checkAccess();
    });
}

async function registerUser(fbUser) {
    try {
        const response = await fetch('/api/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: fbUser.name,
                facebookId: fbUser.id,
                email: fbUser.email
            })
        });
        const user = await response.json();
        currentUser = user;
        
        // Save session for 30 minutes
        saveSession(user);
    } catch (error) {
        console.error('Error registering user:', error);
    }
}

function checkAccess() {
    if (currentUser && currentUser.name === 'Morten Gryning') {
        showMainContent();
        loadUsers();
    } else {
        showAccessDenied();
    }
}

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
    
    updateTopBar();
}

function showMainContent() {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('main-content').style.display = 'block';
    document.getElementById('top-bar').style.display = 'flex';
    document.getElementById('navigation').style.display = 'block';
    document.getElementById('access-denied').style.display = 'none';
    
    updateTopBar();
}

function updateTopBar() {
    if (currentUser && currentUser.name) {
        const firstName = currentUser.name.split(' ')[0];
        const userInfo = currentUser.email ? `${currentUser.name} (${currentUser.email})` : currentUser.name;
        document.getElementById('top-user-name').textContent = userInfo;
        document.getElementById('user-avatar').textContent = firstName.charAt(0).toUpperCase();
        
        // Show admin link in top bar for Morten Gryning
        const adminLink = document.getElementById('top-admin-link');
        if (adminLink && currentUser.name === 'Morten Gryning') {
            adminLink.style.display = 'inline-block';
        }
    } else {
        document.getElementById('top-user-name').textContent = 'User';
        document.getElementById('user-avatar').textContent = 'U';
    }
}

async function loadUsers() {
    try {
        const response = await fetch('/api/users');
        users = await response.json();
        console.log('Users loaded:', users.length);
        renderUsers();
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

function renderUsers() {
    const usersList = document.getElementById('users-list');
    
    if (users.length === 0) {
        usersList.innerHTML = '<div class="empty-state">No users registered yet.</div>';
        return;
    }

    const usersHtml = users.map(user => `
        <div class="user-card" data-user-id="${user.id}">
            <div class="user-info">
                <div class="user-name">${user.name}</div>
                <div class="user-facebook-id">Facebook ID: ${user.facebookId}</div>
                <div class="user-email-display">
                    Email: <span class="email-value">${user.email || 'Not set'}</span>
                    <button class="btn-edit-email" onclick="editEmail('${user.id}')">Edit</button>
                </div>
                <div class="user-email-edit" style="display: none;">
                    <input type="email" class="email-input" value="${user.email || ''}" placeholder="Enter email address">
                    <button class="btn btn-primary btn-save" onclick="saveEmail('${user.id}')">Save</button>
                    <button class="btn btn-secondary btn-cancel" onclick="cancelEditEmail('${user.id}')">Cancel</button>
                </div>
            </div>
        </div>
    `).join('');

    usersList.innerHTML = usersHtml;
}

function editEmail(userId) {
    const userCard = document.querySelector(`[data-user-id="${userId}"]`);
    const displayDiv = userCard.querySelector('.user-email-display');
    const editDiv = userCard.querySelector('.user-email-edit');
    
    displayDiv.style.display = 'none';
    editDiv.style.display = 'block';
    
    // Focus the input
    const input = editDiv.querySelector('.email-input');
    input.focus();
    input.select();
}

function cancelEditEmail(userId) {
    const userCard = document.querySelector(`[data-user-id="${userId}"]`);
    const displayDiv = userCard.querySelector('.user-email-display');
    const editDiv = userCard.querySelector('.user-email-edit');
    
    displayDiv.style.display = 'block';
    editDiv.style.display = 'none';
    
    // Reset input value
    const user = users.find(u => u.id === userId);
    const input = editDiv.querySelector('.email-input');
    input.value = user.email || '';
}

async function saveEmail(userId) {
    const userCard = document.querySelector(`[data-user-id="${userId}"]`);
    const input = userCard.querySelector('.email-input');
    const newEmail = input.value.trim();
    
    // Validate email if provided
    if (newEmail && !isValidEmail(newEmail)) {
        alert('Please enter a valid email address.');
        input.focus();
        return;
    }
    
    try {
        const response = await fetch(`/api/users/${userId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: newEmail || null
            })
        });
        
        if (response.ok) {
            const updatedUser = await response.json();
            
            // Update local users array
            const userIndex = users.findIndex(u => u.id === userId);
            if (userIndex !== -1) {
                users[userIndex] = updatedUser;
            }
            
            // Update display
            const emailValue = userCard.querySelector('.email-value');
            emailValue.textContent = updatedUser.email || 'Not set';
            
            // Hide edit form
            const displayDiv = userCard.querySelector('.user-email-display');
            const editDiv = userCard.querySelector('.user-email-edit');
            displayDiv.style.display = 'block';
            editDiv.style.display = 'none';
            
            showSuccessMessage('Email updated successfully!');
        } else {
            const error = await response.json();
            showErrorMessage(error.message || 'Failed to update email.');
        }
    } catch (error) {
        console.error('Error updating email:', error);
        showErrorMessage('Error updating email. Please try again.');
    }
}

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function showSuccessMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message success-message';
    messageDiv.textContent = message;
    document.querySelector('.user-management').insertBefore(messageDiv, document.getElementById('users-list'));
    
    setTimeout(() => {
        messageDiv.remove();
    }, 3000);
}

function showErrorMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message error-message';
    messageDiv.textContent = message;
    document.querySelector('.user-management').insertBefore(messageDiv, document.getElementById('users-list'));
    
    setTimeout(() => {
        messageDiv.remove();
    }, 5000);
}

document.getElementById('facebook-login-btn').addEventListener('click', async function() {
    try {
        await loadFacebookSdk();
        FB.login(statusChangeCallback, {scope: 'public_profile,email'});
    } catch (err) {
        console.error('FB login unavailable:', err);
        alert('Facebook login is temporarily unavailable. Please refresh the page or try later.');
    }
});

document.getElementById('top-logout-btn').addEventListener('click', async function() {
    clearSession();
    currentUser = null;

    try {
        await loadFacebookSdk();
        FB.getLoginStatus(function(response) {
            // only log out if we were connected
            if (response.status === 'connected') {
                FB.logout(function() {
                    console.log('✅ Logged out of Facebook');
                });
            }
        });
    } catch (err) {
        console.log('SDK not available – ignoring Facebook logout');
    }

    showLoginButton();
});
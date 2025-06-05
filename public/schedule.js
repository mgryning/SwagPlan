/* ===== CONFIG ===== */
const FB_APP_ID = '1249474143244692';
const FB_VERSION = 'v23.0';
/* ================== */

let currentUser = null;
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
        showMainContent();
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
        showMainContent();
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

function showLoginButton() {
    document.getElementById('login-section').style.display = 'block';
    document.getElementById('main-content').style.display = 'none';
    document.getElementById('top-bar').style.display = 'none';
}

function showMainContent() {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('main-content').style.display = 'block';
    document.getElementById('top-bar').style.display = 'flex';
    
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

async function createActivity(title, date, responsible, notes) {
    try {
        const response = await fetch('/api/activities', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                title,
                date,
                responsible,
                notes
            })
        });
        
        if (response.ok) {
            const activity = await response.json();
            showSuccessMessage('Activity created successfully!');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1500);
        } else {
            showErrorMessage('Failed to create activity. Please try again.');
        }
    } catch (error) {
        console.error('Error creating activity:', error);
        showErrorMessage('Error creating activity. Please try again.');
    }
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

document.getElementById('new-activity-form').addEventListener('submit', function(e) {
    e.preventDefault();
    
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

document.getElementById('bulk-schedule-form').addEventListener('submit', function(e) {
    e.preventDefault();
    
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

async function bulkCreateActivities(startMonth) {
    try {
        const response = await fetch('/api/activities/bulk', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                startMonth: startMonth
            })
        });
        
        if (response.ok) {
            const result = await response.json();
            showSuccessMessage(`Successfully created ${result.created} activities!`);
            document.getElementById('bulk-schedule-form').reset();
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 2000);
        } else {
            const error = await response.json();
            showErrorMessage(error.message || 'Failed to create activities. Please try again.');
        }
    } catch (error) {
        console.error('Error creating bulk activities:', error);
        showErrorMessage('Error creating activities. Please try again.');
    }
}


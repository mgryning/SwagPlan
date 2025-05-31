let currentUser = null;

// Check for existing session first
document.addEventListener('DOMContentLoaded', function() {
    const sessionUser = getSession();
    if (sessionUser) {
        currentUser = sessionUser;
        showMainContent();
        return;
    }
    
    // No valid session, check Facebook login
    initializeFacebookLogin();
});

function initializeFacebookLogin() {
    // Small delay to ensure FB SDK is loaded
    setTimeout(function() {
        if (typeof FB !== 'undefined') {
            FB.getLoginStatus(function(response) {
                console.log('Facebook login status:', response.status);
                statusChangeCallback(response);
            });
        } else {
            // FB SDK not loaded yet, show login button
            showLoginButton();
        }
    }, 1000);
}

window.fbAsyncInit = function() {
    try {
        FB.init({
            appId: '1249474143244692',
            cookie: true,
            xfbml: true,
            version: 'v19.0'
        });

        // Only check FB login if we don't have a valid session
        if (!isSessionValid()) {
            FB.getLoginStatus(function(response) {
                console.log('Facebook login status:', response.status);
                statusChangeCallback(response);
            });
        }
    } catch (error) {
        console.error('Facebook SDK initialization error:', error);
        // Fallback to showing login button if FB fails
        showLoginButton();
    }
};

function statusChangeCallback(response) {
    if (response.status === 'connected') {
        fetchUserInfo();
    } else {
        showLoginButton();
    }
}

function fetchUserInfo() {
    FB.api('/me', {fields: 'name,id'}, function(response) {
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
                facebookId: fbUser.id
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
    
    const firstName = currentUser.name.split(' ')[0];
    document.getElementById('top-user-name').textContent = firstName;
    document.getElementById('user-avatar').textContent = firstName.charAt(0).toUpperCase();
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

document.getElementById('facebook-login-btn').addEventListener('click', function() {
    if (typeof FB === 'undefined') {
        console.error('Facebook SDK not loaded');
        alert('Facebook login is temporarily unavailable. Please try refreshing the page.');
        return;
    }
    
    try {
        FB.login(function(response) {
            if (response && response.status) {
                statusChangeCallback(response);
            } else {
                console.error('Invalid Facebook login response:', response);
            }
        }, {scope: 'public_profile'});
    } catch (error) {
        console.error('Facebook login error:', error);
        alert('Facebook login failed. Please try again.');
    }
});

document.getElementById('top-logout-btn').addEventListener('click', function() {
    // Clear our session first
    clearSession();
    currentUser = null;
    
    // Then logout from Facebook
    if (typeof FB !== 'undefined') {
        FB.logout(function(response) {
            console.log('Logged out from Facebook');
        });
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


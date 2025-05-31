let currentUser = null;
let activities = [];

// Check for existing session first
document.addEventListener('DOMContentLoaded', function() {
    const sessionUser = getSession();
    if (sessionUser) {
        currentUser = sessionUser;
        showMainContent();
        loadActivities();
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
        loadActivities();
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

async function loadActivities() {
    try {
        const response = await fetch('/api/activities');
        activities = await response.json();
        renderActivities();
    } catch (error) {
        console.error('Error loading activities:', error);
    }
}

function renderActivities() {
    const upcomingList = document.getElementById('upcoming-activities-list');
    const heldList = document.getElementById('held-activities-list');
    
    if (activities.length === 0) {
        upcomingList.innerHTML = '<div class="empty-state">No upcoming activities. Create the first one!</div>';
        heldList.innerHTML = '<div class="empty-state">No held activities yet.</div>';
        return;
    }

    // Separate activities by status
    const upcomingActivities = activities
        .filter(activity => activity.status === 'planned')
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    
    const heldActivities = activities
        .filter(activity => activity.status === 'held' || activity.status === 'skipped')
        .sort((a, b) => new Date(b.date) - new Date(a.date)) // Most recent first
        .slice(0, 5); // Only show 5 most recent

    function renderActivityCard(activity) {
        const isParticipant = activity.participants.includes(currentUser.id);
        const isCurrentUserResponsible = activity.responsible === currentUser.id;
        const hasResponsiblePerson = activity.responsible && activity.responsible.trim() !== '';
        let responsibleName = 'No one assigned';
        
        if (activity.responsible) {
            if (activity.responsible === currentUser.id) {
                responsibleName = currentUser.name;
            } else if (activity.responsible.length > 10) {
                // If it's a long string, it's likely a user ID, show "Someone"
                responsibleName = 'Someone';
            } else {
                // If it's a short string, it's likely a name entered manually
                responsibleName = activity.responsible;
            }
        }
        
        const statusDisplay = activity.status === 'held' ? 'Held' : 
                         activity.status === 'skipped' ? 'Skipped' : 'Planned';
        const statusClass = activity.status === 'held' ? 'status-held' : 
                           activity.status === 'skipped' ? 'status-skipped' : 'status-planned';
        
        return `
            <div class="activity-card ${activity.status === 'held' ? 'activity-held' : activity.status === 'skipped' ? 'activity-skipped' : ''}">
                <div class="activity-header">
                    <div class="activity-title">${activity.title}</div>
                    <div class="activity-date">${new Date(activity.date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div>
                </div>
                ${activity.status !== 'planned' ? `<div class="activity-status">
                    <span class="status-badge ${statusClass}">${statusDisplay}</span>
                </div>` : ''}
                <div class="activity-responsible">Responsible: ${responsibleName}</div>
                ${activity.notes ? `<div class="activity-notes">${activity.notes}</div>` : ''}
                <div class="activity-actions">
                    ${isCurrentUserResponsible && activity.status === 'planned' ? 
                        `<button class="btn btn-danger" onclick="leaveActivity('${activity.id}')">Leave Activity</button>` :
                        (!hasResponsiblePerson && activity.status === 'planned' ? 
                            `<button class="btn btn-primary" onclick="joinActivity('${activity.id}')">Make me responsible</button>` : 
                            ''
                        )
                    }
                    ${(currentUser.name === 'Morten Gryning' || isCurrentUserResponsible) && activity.status === 'planned' ? 
                        `<button class="btn btn-secondary" onclick="markAsHeld('${activity.id}')" style="margin-left: 10px;">Mark as Held</button>
                         <button class="btn btn-warning" onclick="markAsSkipped('${activity.id}')" style="margin-left: 10px;">Mark as Skipped</button>` : 
                        ''
                    }
                    ${currentUser.name === 'Morten Gryning' ? 
                        `<button class="btn btn-danger" onclick="deleteActivity('${activity.id}')" style="margin-left: 10px;">Delete</button>` : 
                        ''
                    }
                </div>
            </div>
        `;
    }

    // Render upcoming activities
    if (upcomingActivities.length === 0) {
        upcomingList.innerHTML = '<div class="empty-state">No upcoming activities. Create the first one!</div>';
    } else {
        upcomingList.innerHTML = upcomingActivities.map(renderActivityCard).join('');
    }

    // Render held activities
    if (heldActivities.length === 0) {
        heldList.innerHTML = '<div class="empty-state">No held activities yet.</div>';
    } else {
        heldList.innerHTML = heldActivities.map(renderActivityCard).join('');
    }
}

async function joinActivity(activityId) {
    try {
        const response = await fetch(`/api/activities/${activityId}/signup`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                userId: currentUser.id
            })
        });
        
        if (response.ok) {
            loadActivities();
        }
    } catch (error) {
        console.error('Error joining activity:', error);
    }
}

async function leaveActivity(activityId) {
    try {
        const response = await fetch(`/api/activities/${activityId}/leave`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                userId: currentUser.id
            })
        });
        
        if (response.ok) {
            loadActivities();
        }
    } catch (error) {
        console.error('Error leaving activity:', error);
    }
}

async function markAsHeld(activityId) {
    try {
        const response = await fetch(`/api/activities/${activityId}/mark-held`, {
            method: 'POST'
        });
        
        if (response.ok) {
            loadActivities();
        } else {
            console.error('Failed to mark activity as held');
        }
    } catch (error) {
        console.error('Error marking activity as held:', error);
    }
}

async function markAsSkipped(activityId) {
    try {
        const response = await fetch(`/api/activities/${activityId}/mark-skipped`, {
            method: 'POST'
        });
        
        if (response.ok) {
            loadActivities();
        } else {
            console.error('Failed to mark activity as skipped');
        }
    } catch (error) {
        console.error('Error marking activity as skipped:', error);
    }
}

async function deleteActivity(activityId) {
    if (!confirm('Are you sure you want to delete this activity?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/activities/${activityId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            loadActivities();
        } else {
            console.error('Failed to delete activity');
        }
    } catch (error) {
        console.error('Error deleting activity:', error);
    }
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


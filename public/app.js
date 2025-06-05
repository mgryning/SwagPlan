/* ===== CONFIG ===== */
const FB_APP_ID = '1249474143244692';
const FB_VERSION = 'v23.0';
/* ================== */

let currentUser = null;
let activities = [];
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
        showMainContent();
        loadActivities();
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

async function loadUsers() {
    try {
        const response = await fetch('/api/users');
        users = await response.json();
        console.log('Users loaded:', users.length);
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

function getUserName(userId) {
    if (!userId) return 'No one assigned';
    
    // If it's the current user
    if (currentUser && userId === currentUser.id) {
        return currentUser.name;
    }
    
    // Look up in users array
    const user = users.find(u => u.id === userId);
    if (user) {
        return user.name;
    }
    
    // If it's a short string (not a user ID), return as-is (manually entered name)
    if (userId.length <= 10) {
        return userId;
    }
    
    // Fallback for unknown user IDs - but this should rarely happen now
    console.warn('Unknown user ID:', userId, 'Users loaded:', users.length);
    return 'Someone';
}

async function loadActivities() {
    try {
        // Ensure users are loaded first
        await loadUsers();
        
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
        const responsibleName = getUserName(activity.responsible);
        
        const statusDisplay = activity.status === 'held' ? 'Held' : 
                         activity.status === 'skipped' ? 'Skipped' : 'Planned';
        const statusClass = activity.status === 'held' ? 'status-held' : 
                           activity.status === 'skipped' ? 'status-skipped' : 'status-planned';
        
        return `
            <div class="activity-card ${activity.status === 'held' ? 'activity-held' : activity.status === 'skipped' ? 'activity-skipped' : ''} ${activity.status === 'planned' ? (hasResponsiblePerson ? 'has-responsible' : 'no-responsible') : ''}">
                <div class="activity-header">
                    <div class="activity-title-section">
                        <div class="activity-icon">🎯</div>
                        <div class="activity-title">${activity.title}</div>
                    </div>
                    ${activity.status !== 'planned' ? `<div class="activity-status">
                        <span class="status-badge ${statusClass}">
                            ${activity.status === 'held' ? '✅' : activity.status === 'skipped' ? '⏭️' : '📅'} ${statusDisplay}
                        </span>
                    </div>` : ''}
                </div>
                
                <div class="activity-details">
                    <div class="activity-date">
                        <span class="detail-icon">📅</span>
                        <span class="detail-text">${new Date(activity.date).toLocaleDateString('en-US', { 
                            weekday: 'long',
                            month: 'long', 
                            day: 'numeric',
                            year: 'numeric' 
                        })}</span>
                    </div>
                    
                    <div class="activity-responsible">
                        <span class="detail-icon">${hasResponsiblePerson ? '👤' : '❓'}</span>
                        <span class="detail-text ${hasResponsiblePerson ? 'has-person' : 'no-person'}">
                            ${hasResponsiblePerson ? `${responsibleName} is responsible` : 'No one assigned yet'}
                        </span>
                    </div>
                    
                    ${activity.notes ? `<div class="activity-notes">
                        <span class="detail-icon">📝</span>
                        <span class="detail-text">${activity.notes}</span>
                    </div>` : ''}
                </div>
                <div class="activity-actions">
                    ${isCurrentUserResponsible && activity.status === 'planned' ? 
                        `<button class="btn btn-danger" onclick="leaveActivity('${activity.id}')">
                            <span>👋</span> Leave Activity
                         </button>` :
                        (!hasResponsiblePerson && activity.status === 'planned' ? 
                            `<button class="btn btn-primary" onclick="joinActivity('${activity.id}')">
                                <span>🙋‍♂️</span> Make me responsible
                             </button>` : 
                            ''
                        )
                    }
                    ${(currentUser.name === 'Morten Gryning' || isCurrentUserResponsible) && activity.status === 'planned' ? 
                        `<button class="btn btn-secondary" onclick="markAsHeld('${activity.id}')">
                            <span>✅</span> Mark as Held
                         </button>
                         <button class="btn btn-warning" onclick="markAsSkipped('${activity.id}')">
                            <span>⏭️</span> Mark as Skipped
                         </button>` : 
                        ''
                    }
                    ${(currentUser.name === 'Morten Gryning' || isCurrentUserResponsible) && (activity.status === 'held' || activity.status === 'skipped') ? 
                        `<button class="btn btn-primary" onclick="markAsPlanned('${activity.id}')">
                            <span>📅</span> Mark as Planned
                         </button>` : 
                        ''
                    }
                    ${currentUser.name === 'Morten Gryning' ? 
                        `<button class="btn btn-danger" onclick="deleteActivity('${activity.id}')">
                            <span>🗑️</span> Delete
                         </button>` : 
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
            await loadActivities();
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
            await loadActivities();
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
            await loadActivities();
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
            await loadActivities();
        } else {
            console.error('Failed to mark activity as skipped');
        }
    } catch (error) {
        console.error('Error marking activity as skipped:', error);
    }
}

async function markAsPlanned(activityId) {
    try {
        const response = await fetch(`/api/activities/${activityId}/mark-planned`, {
            method: 'POST'
        });
        
        if (response.ok) {
            await loadActivities();
        } else {
            console.error('Failed to mark activity as planned');
        }
    } catch (error) {
        console.error('Error marking activity as planned:', error);
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
            await loadActivities();
        } else {
            console.error('Failed to delete activity');
        }
    } catch (error) {
        console.error('Error deleting activity:', error);
    }
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


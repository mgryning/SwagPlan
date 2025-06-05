// Session management utility functions
const SESSION_KEY = 'swagplan_session';
const SESSION_DURATION = 30 * 60 * 1000; // 30 minutes in milliseconds

function saveSession(user) {
    const session = {
        user: user,
        timestamp: Date.now(),
        expiresAt: Date.now() + SESSION_DURATION
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    console.log('Session saved for user:', user.name);
}

function getSession() {
    try {
        const sessionData = localStorage.getItem(SESSION_KEY);
        if (!sessionData) {
            console.log('No session found');
            return null;
        }

        const session = JSON.parse(sessionData);
        const now = Date.now();

        // Check if session is expired
        if (now > session.expiresAt) {
            console.log('Session expired, clearing');
            clearSession();
            return null;
        }

        // Extend session if it's more than halfway through
        const halfwayPoint = session.timestamp + (SESSION_DURATION / 2);
        if (now > halfwayPoint) {
            console.log('Extending session');
            session.expiresAt = now + SESSION_DURATION;
            localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        }

        console.log('Valid session found for user:', session.user.name);
        return session.user;
    } catch (error) {
        console.error('Error reading session:', error);
        clearSession();
        return null;
    }
}

function clearSession() {
    localStorage.removeItem(SESSION_KEY);
    console.log('Session cleared');
}

function isSessionValid() {
    return getSession() !== null;
}

// Check session on page visibility change (when user comes back to tab)
document.addEventListener('visibilitychange', function() {
    if (!document.hidden) {
        // Page became visible, check if session is still valid
        const user = getSession();
        if (!user && window.currentUser) {
            // Session expired while page was hidden
            console.log('Session expired while away, logging out');
            window.currentUser = null;
            if (typeof showLoginButton === 'function') {
                showLoginButton();
            }
        }
    }
});
(function authClientBootstrap() {
    const FB_APP_ID = window.SWAGPLAN_FACEBOOK_APP_ID || '1249474143244692';
    const FB_VERSION = 'v23.0';
    const FACEBOOK_STATE_KEY = 'swagplan_facebook_oauth_state';
    const FACEBOOK_RETURN_KEY = 'swagplan_facebook_return_to';

    const state = {
        currentUser: null,
        fbInitPromise: null
    };

    function getJsonErrorMessage(payload, fallback) {
        if (payload && typeof payload.error === 'string') {
            return payload.error;
        }

        if (payload && typeof payload.message === 'string') {
            return payload.message;
        }

        return fallback;
    }

    async function requestJson(url, options = {}) {
        const response = await fetch(url, {
            credentials: 'same-origin',
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {})
            }
        });

        let payload = null;
        try {
            payload = await response.json();
        } catch (error) {
            payload = null;
        }

        if (!response.ok) {
            const error = new Error(getJsonErrorMessage(payload, 'Request failed'));
            error.status = response.status;
            error.payload = payload;
            throw error;
        }

        return payload;
    }

    function getAuthFeedbackElement() {
        return document.getElementById('auth-feedback');
    }

    function showAuthMessage(message, type = 'success') {
        const feedback = getAuthFeedbackElement();
        if (!feedback) {
            return;
        }

        feedback.innerHTML = `<div class="message ${type === 'error' ? 'error-message' : 'success-message'}">${message}</div>`;
    }

    function clearAuthMessage() {
        const feedback = getAuthFeedbackElement();
        if (feedback) {
            feedback.innerHTML = '';
        }
    }

    function setFormBusy(form, isBusy) {
        if (!form) {
            return;
        }

        const fields = form.querySelectorAll('button, input');
        fields.forEach((field) => {
            field.disabled = isBusy;
        });
    }

    function updateTopBar(user) {
        state.currentUser = user || null;

        const topUserName = document.getElementById('top-user-name');
        const userAvatar = document.getElementById('user-avatar');
        const adminLink = document.getElementById('top-admin-link');

        if (!topUserName || !userAvatar) {
            return;
        }

        if (user && user.name) {
            const firstName = user.name.split(' ')[0];
            const userInfo = user.email ? `${user.name} (${user.email})` : user.name;
            topUserName.textContent = userInfo;
            userAvatar.textContent = firstName.charAt(0).toUpperCase();
        } else {
            topUserName.textContent = 'Guest';
            userAvatar.textContent = 'G';
        }

        if (adminLink) {
            adminLink.style.display = user && user.isAdmin ? 'inline-block' : 'none';
        }
    }

    function isMobileViewport() {
        return window.matchMedia('(max-width: 900px)').matches;
    }

    function isLikelyEmbeddedBrowser() {
        const userAgent = navigator.userAgent || '';
        const normalized = userAgent.toLowerCase();

        return (
            normalized.includes('fban') ||
            normalized.includes('fbav') ||
            normalized.includes('instagram') ||
            normalized.includes('line/') ||
            normalized.includes('wv') ||
            normalized.includes('messenger')
        );
    }

    function shouldUseFacebookRedirectFlow() {
        return isMobileViewport() || isLikelyEmbeddedBrowser();
    }

    function generateOauthState() {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    }

    function buildFacebookRedirectUrl() {
        const stateToken = generateOauthState();
        sessionStorage.setItem(FACEBOOK_STATE_KEY, stateToken);
        sessionStorage.setItem(FACEBOOK_RETURN_KEY, `${window.location.pathname}${window.location.search}${window.location.hash}`);

        const redirectUrl = new URL(`https://www.facebook.com/${FB_VERSION}/dialog/oauth`);
        redirectUrl.searchParams.set('client_id', FB_APP_ID);
        redirectUrl.searchParams.set('redirect_uri', `${window.location.origin}/facebook-login-callback.html`);
        redirectUrl.searchParams.set('response_type', 'token');
        redirectUrl.searchParams.set('scope', 'public_profile,email');
        redirectUrl.searchParams.set('state', stateToken);

        if (isMobileViewport()) {
            redirectUrl.searchParams.set('display', 'touch');
        }

        return redirectUrl.toString();
    }

    function startFacebookRedirectLogin() {
        window.location.assign(buildFacebookRedirectUrl());
    }

    function getStoredFacebookReturnPath() {
        return sessionStorage.getItem(FACEBOOK_RETURN_KEY) || '/';
    }

    function clearFacebookRedirectState() {
        sessionStorage.removeItem(FACEBOOK_STATE_KEY);
        sessionStorage.removeItem(FACEBOOK_RETURN_KEY);
    }

    function readFacebookCallbackHash() {
        const hash = window.location.hash.startsWith('#')
            ? window.location.hash.slice(1)
            : window.location.hash;
        return new URLSearchParams(hash);
    }

    async function completeFacebookRedirectLogin() {
        const params = readFacebookCallbackHash();
        const accessToken = params.get('access_token');
        const incomingState = params.get('state');
        const storedState = sessionStorage.getItem(FACEBOOK_STATE_KEY);
        const returnTo = getStoredFacebookReturnPath();
        const errorReason = params.get('error_reason') || params.get('error_description');

        if (errorReason) {
            throw new Error(errorReason.replace(/\+/g, ' '));
        }

        if (!accessToken) {
            throw new Error('Facebook did not return an access token');
        }

        if (!incomingState || !storedState || incomingState !== storedState) {
            throw new Error('Facebook login state could not be validated');
        }

        const result = await requestJson('/api/auth/facebook', {
            method: 'POST',
            body: JSON.stringify({
                accessToken
            })
        });

        clearFacebookRedirectState();
        return {
            user: result.user,
            returnTo
        };
    }

    function loadFacebookSdk() {
        if (state.fbInitPromise) {
            return state.fbInitPromise;
        }

        state.fbInitPromise = new Promise((resolve, reject) => {
            window.fbAsyncInit = () => {
                try {
                    FB.init({
                        appId: FB_APP_ID,
                        cookie: true,
                        xfbml: false,
                        version: FB_VERSION
                    });
                    resolve();
                } catch (error) {
                    reject(error);
                }
            };

            if (!document.getElementById('facebook-jssdk')) {
                const script = document.createElement('script');
                script.id = 'facebook-jssdk';
                script.src = 'https://connect.facebook.net/en_US/sdk.js';
                script.async = true;
                script.defer = true;
                script.crossOrigin = 'anonymous';
                script.onerror = () => reject(new Error('Facebook SDK download failed'));
                document.head.appendChild(script);
            }

            setTimeout(() => reject(new Error('Facebook SDK load timeout')), 10000);
        });

        return state.fbInitPromise;
    }

    async function signInWithFacebook() {
        await loadFacebookSdk();

        const loginResponse = await new Promise((resolve) => {
            FB.login(resolve, { scope: 'public_profile,email' });
        });

        if (!loginResponse || loginResponse.status !== 'connected' || !loginResponse.authResponse?.accessToken) {
            throw new Error('Facebook login was cancelled');
        }

        const result = await requestJson('/api/auth/facebook', {
            method: 'POST',
            body: JSON.stringify({
                accessToken: loginResponse.authResponse.accessToken
            })
        });

        updateTopBar(result.user);
        return result.user;
    }

    async function signInWithPassword(email, password) {
        const result = await requestJson('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });

        updateTopBar(result.user);
        return result.user;
    }

    async function submitSignup(name, email, password) {
        return requestJson('/api/auth/signup', {
            method: 'POST',
            body: JSON.stringify({ name, email, password })
        });
    }

    async function requestPasswordReset(email) {
        return requestJson('/api/auth/forgot-password', {
            method: 'POST',
            body: JSON.stringify({ email })
        });
    }

    async function validateResetToken(token) {
        return requestJson(`/api/auth/reset-password/validate?token=${encodeURIComponent(token)}`);
    }

    async function resetPassword(token, password) {
        return requestJson('/api/auth/reset-password', {
            method: 'POST',
            body: JSON.stringify({ token, password })
        });
    }

    async function logout() {
        try {
            await requestJson('/api/auth/logout', { method: 'POST', body: '{}' });
        } catch (error) {
            console.warn('Server logout failed:', error);
        }

        state.currentUser = null;
        updateTopBar(null);

        try {
            await loadFacebookSdk();
            FB.getLoginStatus((response) => {
                if (response.status === 'connected') {
                    FB.logout(() => {
                        console.log('Logged out of Facebook');
                    });
                }
            });
        } catch (error) {
            console.log('Facebook SDK unavailable during logout');
        }
    }

    async function getCurrentUser() {
        const result = await requestJson('/api/auth/me');
        updateTopBar(result.user);
        return result.user;
    }

    async function initializePage(options) {
        const {
            requireAdmin = false,
            onAuthenticated,
            showLogin,
            showMain,
            showAccessDenied,
            onLoggedOut
        } = options;

        const facebookButton = document.getElementById('facebook-login-btn');
        const localLoginForm = document.getElementById('local-login-form');
        const signupForm = document.getElementById('signup-form');
        const logoutButton = document.getElementById('top-logout-btn');
        const forgotPasswordForm = document.getElementById('forgot-password-form');
        const forgotPasswordToggle = document.getElementById('forgot-password-toggle');

        if (facebookButton) {
            facebookButton.addEventListener('click', async () => {
                clearAuthMessage();
                facebookButton.disabled = true;

                try {
                    if (shouldUseFacebookRedirectFlow()) {
                        if (isLikelyEmbeddedBrowser()) {
                            showAuthMessage('Redirecting to Facebook login. If the in-app browser blocks it, open SwagPlan in Safari or Chrome.', 'success');
                        }
                        startFacebookRedirectLogin();
                        return;
                    }

                    const user = await signInWithFacebook();
                    if (requireAdmin && !user.isAdmin) {
                        showAccessDenied?.();
                        return;
                    }

                    showMain?.();
                    await onAuthenticated?.(user);
                } catch (error) {
                    showAuthMessage(error.message || 'Facebook login failed', 'error');
                    showLogin?.();
                } finally {
                    facebookButton.disabled = false;
                }
            });
        }

        if (localLoginForm) {
            localLoginForm.addEventListener('submit', async (event) => {
                event.preventDefault();
                clearAuthMessage();
                setFormBusy(localLoginForm, true);

                const email = document.getElementById('login-email')?.value.trim();
                const password = document.getElementById('login-password')?.value || '';

                try {
                    const user = await signInWithPassword(email, password);
                    if (requireAdmin && !user.isAdmin) {
                        showAccessDenied?.();
                        return;
                    }

                    localLoginForm.reset();
                    showMain?.();
                    await onAuthenticated?.(user);
                } catch (error) {
                    showAuthMessage(error.message || 'Unable to sign in', 'error');
                    showLogin?.();
                } finally {
                    setFormBusy(localLoginForm, false);
                }
            });
        }

        if (signupForm) {
            signupForm.addEventListener('submit', async (event) => {
                event.preventDefault();
                clearAuthMessage();
                setFormBusy(signupForm, true);

                const name = document.getElementById('signup-name')?.value.trim();
                const email = document.getElementById('signup-email')?.value.trim();
                const password = document.getElementById('signup-password')?.value || '';

                try {
                    const result = await submitSignup(name, email, password);
                    signupForm.reset();
                    showAuthMessage(result.message, 'success');
                } catch (error) {
                    showAuthMessage(error.message || 'Unable to submit signup request', 'error');
                } finally {
                    setFormBusy(signupForm, false);
                }
            });
        }

        if (forgotPasswordToggle && forgotPasswordForm) {
            forgotPasswordToggle.addEventListener('click', (event) => {
                event.preventDefault();
                forgotPasswordForm.style.display = forgotPasswordForm.style.display === 'block' ? 'none' : 'block';
            });
        }

        if (forgotPasswordForm) {
            forgotPasswordForm.addEventListener('submit', async (event) => {
                event.preventDefault();
                clearAuthMessage();
                setFormBusy(forgotPasswordForm, true);

                const email = document.getElementById('forgot-email')?.value.trim();

                try {
                    const result = await requestPasswordReset(email);
                    forgotPasswordForm.reset();
                    forgotPasswordForm.style.display = 'none';
                    showAuthMessage(result.message, 'success');
                } catch (error) {
                    showAuthMessage(error.message || 'Unable to send reset email', 'error');
                } finally {
                    setFormBusy(forgotPasswordForm, false);
                }
            });
        }

        if (logoutButton) {
            logoutButton.addEventListener('click', async () => {
                await logout();
                clearAuthMessage();
                showLogin?.();
                onLoggedOut?.();
            });
        }

        try {
            const user = await getCurrentUser();
            if (!user) {
                showLogin?.();
                return;
            }

            if (requireAdmin && !user.isAdmin) {
                showAccessDenied?.();
                return;
            }

            if (user.status !== 'approved') {
                showAuthMessage('Your account is awaiting admin approval.', 'error');
                showLogin?.();
                return;
            }

            showMain?.();
            await onAuthenticated?.(user);
        } catch (error) {
            console.error('Unable to restore session:', error);
            showLogin?.();
        }
    }

    window.SwagAuth = {
        clearFacebookRedirectState,
        completeFacebookRedirectLogin,
        clearAuthMessage,
        getCurrentUser,
        getStoredFacebookReturnPath,
        initializePage,
        requestPasswordReset,
        requestJson,
        resetPassword,
        shouldUseFacebookRedirectFlow,
        showAuthMessage,
        validateResetToken,
        updateTopBar
    };
})();

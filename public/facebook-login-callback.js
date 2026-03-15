document.addEventListener('DOMContentLoaded', async () => {
    const copy = document.getElementById('facebook-callback-copy');

    try {
        const result = await SwagAuth.completeFacebookRedirectLogin();
        copy.textContent = 'Facebook sign-in worked. Redirecting you back to SwagPlan...';
        window.location.replace(result.returnTo || '/');
    } catch (error) {
        SwagAuth.clearFacebookRedirectState();
        copy.textContent = 'Facebook sign-in could not be completed.';
        SwagAuth.showAuthMessage(
            `${error.message || 'Unable to finish Facebook sign-in.'} If this happened inside an in-app browser, open SwagPlan in Safari or Chrome and try again.`,
            'error'
        );
    }
});

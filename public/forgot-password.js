document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    const requestForm = document.getElementById('request-reset-form');
    const completeForm = document.getElementById('complete-reset-form');
    const pageCopy = document.getElementById('reset-page-copy');

    if (token) {
        requestForm.style.display = 'none';
        completeForm.style.display = 'flex';
        pageCopy.textContent = 'Choose a new password for your account.';

        try {
            await SwagAuth.validateResetToken(token);
        } catch (error) {
            completeForm.style.display = 'none';
            SwagAuth.showAuthMessage(error.message || 'This reset link is invalid or has expired.', 'error');
            return;
        }
    }

    requestForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const email = document.getElementById('request-email').value.trim();

        try {
            const result = await SwagAuth.requestPasswordReset(email);
            requestForm.reset();
            SwagAuth.showAuthMessage(result.message, 'success');
        } catch (error) {
            SwagAuth.showAuthMessage(error.message || 'Unable to send reset email.', 'error');
        }
    });

    completeForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const password = document.getElementById('new-password').value;
        const confirmPassword = document.getElementById('confirm-password').value;

        if (password !== confirmPassword) {
            SwagAuth.showAuthMessage('Passwords do not match.', 'error');
            return;
        }

        try {
            const result = await SwagAuth.resetPassword(token, password);
            completeForm.reset();
            completeForm.style.display = 'none';
            SwagAuth.showAuthMessage(result.message, 'success');
        } catch (error) {
            SwagAuth.showAuthMessage(error.message || 'Unable to reset password.', 'error');
        }
    });
});

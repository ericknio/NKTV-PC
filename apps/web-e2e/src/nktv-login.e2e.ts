import { expect, test } from './fixtures';

test.describe('NKTV Login Flow', () => {
    test('@web renders the NKTV login screen and validates form controls', async ({ page }) => {
        await page.goto('/');

        // Page title check
        await expect(page).toHaveTitle('NKTV');

        // Brand header check
        await expect(page.getByRole('heading', { name: 'NKTV', level: 1 })).toBeVisible();
        await expect(page.getByText('STREAMING MULTIPLATAFORMA BRASIL')).toBeVisible();

        // Form elements
        const usernameInput = page.getByPlaceholder('Digite seu usuário');
        const passwordInput = page.getByPlaceholder('Digite sua senha');
        const submitButton = page.getByRole('button', { name: 'ENTRAR' });

        await expect(usernameInput).toBeVisible();
        await expect(passwordInput).toBeVisible();

        // Submit button should be disabled when fields are empty
        await expect(submitButton).toBeDisabled();

        // Filling credentials enables the submit button
        await usernameInput.fill('teste_usuario');
        await expect(submitButton).toBeDisabled();

        await passwordInput.fill('senha123');
        await expect(submitButton).toBeEnabled();

        // Password visibility toggle
        await expect(passwordInput).toHaveAttribute('type', 'password');
        const toggleButton = page.getByRole('button', { name: 'Mostrar senha' });
        await toggleButton.click();
        await expect(passwordInput).toHaveAttribute('type', 'text');
        await toggleButton.click();
        await expect(passwordInput).toHaveAttribute('type', 'password');

        // Footer copyright check
        await expect(page.getByText('NKTV Brasil • Todos os direitos reservados')).toBeVisible();
    });
});

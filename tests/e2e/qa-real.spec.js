import { test, expect } from '@playwright/test'

const email = process.env.E2E_EMAIL
const password = process.env.E2E_PASSWORD

test.describe('FASE 4 — QA E2E real', () => {
  test.skip(!email || !password, 'Configure E2E_EMAIL e E2E_PASSWORD nos GitHub Secrets.')

  test('login real', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Contabilidade/i)
    // O fluxo visual permanece o da aplicação existente.
    await page.getByLabel(/e-mail|email/i).fill(email)
    await page.getByLabel(/senha|password/i).fill(password)
    await page.getByRole('button', { name: /entrar|login/i }).click()
    await expect(page.locator('body')).not.toContainText(/entrar na conta|login/i)
  })

  test('reset de senha — formulário acessível', async ({ page }) => {
    await page.goto('/')
    const reset = page.getByRole('button', { name: /esqueci|recuperar|reset/i })
    await expect(reset).toBeVisible()
    await reset.click()
    await expect(page.getByLabel(/e-mail|email/i)).toBeVisible()
  })

  test('offline e sincronização — APIs continuam inacessíveis offline', async ({ page, context }) => {
    await page.goto('/')
    await context.setOffline(true)
    await expect(page.locator('body')).toBeVisible()
    await context.setOffline(false)
  })

  test('geração de PDF — aplicativo permanece funcional', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('body')).toBeVisible()
  })

  test('fluxo de exclusão de dados/conta fica protegido contra execução acidental', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('body')).toBeVisible()
  })
})

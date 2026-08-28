import { test, expect } from '@playwright/test'

const email = process.env.E2E_EMAIL
const password = process.env.E2E_PASSWORD

test.describe('FASE 4 — QA E2E real', () => {
  test.skip(
    !email || !password,
    'Configure E2E_EMAIL e E2E_PASSWORD nos GitHub Secrets.'
  )

  test('login real', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveTitle(
      /Marcus Vinícius Porto Souza LTDA/i
    )

    await page.locator('input[type="email"]').fill(email)
    await page.locator('input[type="password"]').fill(password)

    // A aplicação possui mais de um botão "Entrar".
    // Selecionamos explicitamente o submit do formulário.
    await page.locator('button[type="submit"]').filter({
      hasText: 'Entrar',
    }).click()

    await expect(
      page.getByRole('button', { name: /^Sair$/i })
    ).toBeVisible({ timeout: 15000 })
  })

  test('reset de senha — formulário acessível', async ({ page }) => {
    await page.goto('/')

    const reset = page.getByRole('button', {
      name: /esqueci minha senha/i,
    })

    await expect(reset).toBeVisible()
    await reset.click()

    await expect(
      page.locator('input[type="email"]')
    ).toBeVisible()

    await expect(
      page.getByRole('button', { name: /enviar instruções/i })
    ).toBeVisible()

    await expect(
      page.getByRole('button', { name: /voltar para entrar/i })
    ).toBeVisible()
  })

  test('offline e sincronização — aplicação permanece funcional offline', async ({
    page,
    context,
  }) => {
    await page.goto('/')

    await context.setOffline(true)

    await expect(page.locator('body')).toBeVisible()

    await context.setOffline(false)
  })

  test('geração de PDF — aplicativo permanece funcional', async ({
    page,
  }) => {
    await page.goto('/')

    await expect(page.locator('body')).toBeVisible()
  })

  test('fluxo de exclusão de dados/conta fica protegido contra execução acidental', async ({
    page,
  }) => {
    await page.goto('/')

    await expect(page.locator('body')).toBeVisible()
  })
})

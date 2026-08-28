import { test, expect } from '@playwright/test'

const email = process.env.E2E_EMAIL
const password = process.env.E2E_PASSWORD

// A suíte real só executa quando as credenciais de QA existem no ambiente.
test.skip(!email || !password, 'Configure E2E_EMAIL e E2E_PASSWORD.')

const QA_MARKER = `QA-E2E-${Date.now()}`
const QA_EDITED = `${QA_MARKER}-EDITADO`

async function login(page) {
  await page.goto('/')
  await expect(page).toHaveTitle(/Marcus Vinícius Porto Souza LTDA/i)

  const signedOutButton = page.getByRole('button', { name: /^Sair$/i })
  if (await signedOutButton.isVisible().catch(() => false)) return

  const authForm = page.locator('form').filter({ has: page.locator('input[type="email"]') })
  await expect(authForm.locator('input[type="email"]')).toBeVisible({ timeout: 15_000 })
  await authForm.locator('input[type="email"]').fill(email)
  await authForm.locator('input[type="password"]').fill(password)
  await authForm.locator('button[type="submit"]').click()
  await expect(signedOutButton).toBeVisible({ timeout: 15_000 })
}

async function logout(page) {
  await page.getByRole('button', { name: /^Sair$/i }).click()
  await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 15_000 })
}

async function openTransactions(page) {
  // The bottom navigation is the stable app-level control. Wait for the
  // authenticated shell before interacting with it; this avoids racing
  // AuthGate/App hydration in production.
  await expect(page.getByRole('button', { name: /^Sair$/i })).toBeVisible({
    timeout: 15_000,
  })
  const nav = page.locator('.app-bottom-nav')
  await expect(nav).toBeVisible({ timeout: 15_000 })

  // Each bottom-nav button contains both an icon and a text <span>.
  // Playwright therefore computes the accessible name as "≡ Lançamentos"
  // (and similarly for the other tabs), not exactly "Lançamentos".
  // Target the visible label inside the button to avoid depending on the
  // icon's contribution to the accessible name.
  const button = nav
    .getByText('Lançamentos', { exact: true })
    .locator('..')
  await expect(button).toBeVisible({ timeout: 15_000 })
  await button.click()
  await expect(page.getByText(/\d+ registros$/i)).toBeVisible({ timeout: 15_000 })
}

function transactionButton(page, type) {
  // Há dois "+ Receita" / "+ Despesa" quando a lista está vazia:
  // o botão principal e o atalho do estado vazio. Ambos executam a mesma
  // ação; usamos o primeiro de forma intencional para evitar strict mode.
  if (type === 'Receita') return page.getByRole('button', { name: /^\+ Receita$/i }).first()
  if (type === 'Despesa') return page.getByRole('button', { name: /^\+ Despesa$/i }).first()
  return page.getByRole('button', { name: /^\+ Distribuição de Lucro$/i }).first()
}

async function createTransaction(page, type, marker, value = '123,45', saveFavorite = false) {
  await openTransactions(page)
  await transactionButton(page, type).click()

  if (type === 'Receita') {
    await page.getByLabel('Nome da Clínica *').fill(marker)
    await page.getByLabel('Descrição da Receita').selectOption({ index: 1 }).catch(() => {})
  } else if (type === 'Despesa') {
    await page.getByLabel('Tipo de Despesa *').selectOption({ index: 1 })
  } else {
    await page.getByLabel('Descrição').fill(marker)
  }

  await page.getByText('Valor *', { exact: true }).locator('..').locator('input').fill(value)
  await page.getByLabel('Data *').fill(new Date().toISOString().slice(0, 10))

  if (saveFavorite && type !== 'Distribuição de Lucro') {
    await page.getByText('Salvar nos favoritos', { exact: true }).click()
  }

  const submitName =
    type === 'Receita'
      ? 'Registrar Receita'
      : type === 'Despesa'
        ? 'Registrar Despesa'
        : 'Registrar Distribuição de Lucro'

  await page.getByRole('button', { name: submitName, exact: true }).click()
  await expect(page.getByText(marker, { exact: true })).toBeVisible({ timeout: 15_000 })
}

async function expandTransaction(page, marker) {
  const text = page.getByText(marker, { exact: true })
  await expect(text).toBeVisible({ timeout: 15_000 })
  const card = text.locator(
    'xpath=ancestor::div[.//button[contains(normalize-space(.), "▾") or contains(normalize-space(.), "▲")]][1]',
  )
  await card.getByRole('button').first().click()
  return card
}

async function deleteTransaction(page, marker) {
  const card = await expandTransaction(page, marker)
  await card.getByRole('button', { name: /Excluir/i }).click()
  await expect(page.getByText(marker, { exact: true })).toHaveCount(0, { timeout: 10_000 })
}

async function waitForActiveServiceWorker(page, timeoutMs = 20_000) {
  return page.evaluate(async (limit) => {
    if (!('serviceWorker' in navigator)) return null

    const started = Date.now()
    while (Date.now() - started < limit) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      const registration =
        registrations.find((item) => item.scope === `${location.origin}/`) ||
        registrations.find((item) => item.active?.scriptURL.endsWith('/sw.js'))

      if (registration?.active) {
        return {
          scope: registration.scope,
          scriptURL: registration.active.scriptURL,
          controller: Boolean(navigator.serviceWorker.controller),
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    return null
  }, timeoutMs)
}

test.describe('LOTE 01 — RELEASE QA / E2E CERTIFICATION', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('1.1 autenticação — sessão persistente, refresh e logout', async ({ page }) => {
    await expect(page.getByRole('button', { name: /^Sair$/i })).toBeVisible()

    await page.reload()
    await expect(page.getByRole('button', { name: /^Sair$/i })).toBeVisible({ timeout: 15_000 })

    await logout(page)
    await page.reload()
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 15_000 })
  })

  test('1.1 autenticação — acesso sem autenticação é bloqueado', async ({ page }) => {
    const browser = page.context().browser()
    expect(browser).toBeTruthy()

    const guestContext = await browser.newContext()
    const guest = await guestContext.newPage()
    try {
      await guest.goto('/')
      await expect(guest.locator('input[type="email"]')).toBeVisible({ timeout: 15_000 })
      await expect(guest.getByRole('button', { name: 'Criar conta', exact: true })).toBeVisible()
    } finally {
      await guestContext.close()
    }
  })

  test('1.1 autenticação — duas abas compartilham a sessão', async ({ page, context }) => {
    const second = await context.newPage()
    try {
      await second.goto('/')
      await expect(second.getByRole('button', { name: /^Sair$/i })).toBeVisible({ timeout: 15_000 })

      // O logout em uma aba deve propagar para a outra.
      await page.getByRole('button', { name: /^Sair$/i }).click()
      await expect(second.locator('input[type="email"]')).toBeVisible({ timeout: 15_000 })
    } finally {
      await second.close()
    }
  })

  test('1.1 recuperação de senha — solicitação real de redefinição', async ({ page }) => {
    await logout(page)

    const authForm = page.locator('form').filter({ has: page.locator('input[type="email"]') })
    await authForm.getByRole('button', { name: /esqueci minha senha/i }).click()

    const recoveryForm = page.locator('form').filter({ hasText: /Informe seu e-mail para receber as instruções/i })
    await expect(recoveryForm.locator('input[type="email"]')).toBeVisible()
    await recoveryForm.locator('input[type="email"]').fill(email)
    await recoveryForm.getByRole('button', { name: /enviar instruções/i }).click()

    await expect(page.getByText(/Se o e-mail estiver cadastrado, enviaremos as instruções/i)).toBeVisible({
      timeout: 15_000,
    })
  })

  test('1.2 dados — receita, favorito, edição, despesa, distribuição e exclusão', async ({ page }) => {
    await createTransaction(page, 'Receita', QA_MARKER, '123,45', true)

    await page.getByRole('button', { name: 'Configurações' }).click()
    await page.getByText('⭐ Favoritos', { exact: true }).click()
    await expect(page.getByText(QA_MARKER, { exact: true })).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: '✕' }).click()

    await openTransactions(page)
    const card = await expandTransaction(page, QA_MARKER)
    await card.getByRole('button', { name: /Editar/i }).click()
    await page.getByLabel('Nome da Clínica *').fill(QA_EDITED)
    await page.getByRole('button', { name: 'Salvar Alterações', exact: true }).click()
    await expect(page.getByText(QA_EDITED, { exact: true })).toBeVisible({ timeout: 15_000 })

    await createTransaction(page, 'Despesa', `${QA_MARKER}-DESPESA`)
    await createTransaction(page, 'Distribuição de Lucro', `${QA_MARKER}-DISTRIB`)

    await openTransactions(page)
    await deleteTransaction(page, QA_EDITED)
    await deleteTransaction(page, `${QA_MARKER}-DESPESA`)
    await deleteTransaction(page, `${QA_MARKER}-DISTRIB`)
  })

  test('1.2 favoritos e configurações permanecem acessíveis', async ({ page }) => {
    await page.getByRole('button', { name: 'Configurações' }).click()
    await expect(page.getByText('⭐ Favoritos', { exact: true })).toBeVisible()
    await expect(page.getByText('📤 Exportar dados', { exact: true })).toBeVisible()
    await expect(page.getByText('🔑 Alterar Senha', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '✕' }).click()
  })

  test('1.2 dados tributários — modal exibe os principais itens', async ({ page }) => {
    const moreButton = page
      .locator('.app-bottom-nav')
      .getByText('Mais', { exact: true })
      .locator('..')
    await expect(moreButton).toBeVisible({ timeout: 15_000 })
    await moreButton.click()
    await expect(page.getByText('Tributação', { exact: true })).toBeVisible({
      timeout: 15_000,
    })

    // The modal has no semantic role in the production UI. Use the visible
    // labels themselves instead of depending on a fragile parent hierarchy.
    for (const label of [
      /DAS\s*[—-]\s*Simples Nacional/i,
      /Pró-labore/i,
      /INSS do Sócio/i,
      /Contabilidade/i,
      /^IRRF$/i,
      /Total de Obrigações/i,
    ]) {
      await expect(page.getByText(label).first()).toBeVisible({
        timeout: 10_000,
      })
    }
  })

  test('1.3 sincronização — dado criado continua após logout/login', async ({ page }) => {
    const marker = `${QA_MARKER}-PERSIST`
    await createTransaction(page, 'Receita', marker)

    await logout(page)
    await login(page)
    await openTransactions(page)
    await expect(page.getByText(marker, { exact: true })).toBeVisible({ timeout: 15_000 })

    await deleteTransaction(page, marker)
  })

  test('1.4 offline — alteração sobrevive ao fechamento/reabertura e sincroniza ao voltar online', async ({ page, context }) => {
    const sw = await waitForActiveServiceWorker(page)
    expect(sw?.scriptURL).toMatch(/\/sw\.js$/)

    // Garante que o shell atual e seus chunks já foram carregados online antes do teste offline.
    await page.reload()
    await expect(page.getByRole('button', { name: /^Sair$/i })).toBeVisible({ timeout: 15_000 })

    await context.setOffline(true)
    await page.close()

    const reopened = await context.newPage()
    try {
      await reopened.goto('/')
      await expect(reopened.getByRole('button', { name: /^Sair$/i })).toBeVisible({ timeout: 15_000 })
      await expect(reopened.getByText(/Modo offline/i)).toBeVisible({ timeout: 10_000 })

      const marker = `${QA_MARKER}-OFFLINE`
      await createTransaction(reopened, 'Receita', marker)
      await expect(reopened.getByText(marker, { exact: true })).toBeVisible({ timeout: 15_000 })

      await context.setOffline(false)
      await reopened.reload()
      await expect(reopened.getByText(marker, { exact: true })).toBeVisible({ timeout: 20_000 })

      await deleteTransaction(reopened, marker)
    } finally {
      await context.setOffline(false)
      await reopened.close()
    }
  })

  test('1.5 conflito — alteração concorrente é detectada e pode ser resolvida', async ({ page, context }) => {
    const second = await context.newPage()
    try {
      await second.goto('/')
      await expect(second.getByRole('button', { name: /^Sair$/i })).toBeVisible({ timeout: 15_000 })

      await openTransactions(page)
      await openTransactions(second)

      await createTransaction(page, 'Receita', `${QA_MARKER}-A`)
      await createTransaction(second, 'Receita', `${QA_MARKER}-B`)

      await expect(second.getByRole('alert')).toContainText(/versão mais recente na nuvem/i, {
        timeout: 20_000,
      })

      await second.getByRole('button', { name: /Usar versão da nuvem/i }).click()
      await expect(second.getByText(`${QA_MARKER}-A`, { exact: true })).toBeVisible({ timeout: 15_000 })
      await expect(second.getByText(`${QA_MARKER}-B`, { exact: true })).toHaveCount(0)

      await openTransactions(page)
      await deleteTransaction(page, `${QA_MARKER}-A`)
    } finally {
      await second.close()
    }
  })

  test('1.6 PDF — geração dispara download PDF real', async ({ page }) => {
    await page.getByRole('button', { name: 'Dados Mensais' }).click()
    const report = page.getByRole('button', { name: /Gerar Relatório \(PDF\)/i })
    await expect(report).toBeVisible()

    const downloadPromise = page.waitForEvent('download', { timeout: 15_000 })
    await report.click()
    const download = await downloadPromise

    expect(download.suggestedFilename()).toMatch(/\.pdf$/i)
  })

  test('1.7 PWA — manifest, Service Worker, escopo e assets', async ({ page }) => {
    // Registration is initiated by the app after the document loads.
    await page.reload()
    await expect(page.getByRole('button', { name: /^Sair$/i })).toBeVisible({
      timeout: 15_000,
    })

    const manifest = await page.evaluate(async () => {
      const response = await fetch('/manifest.json', { cache: 'no-store' })
      if (!response.ok) throw new Error(`Manifest HTTP ${response.status}`)
      return response.json()
    })

    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toBe('/')
    expect(manifest.scope).toBe('/')
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: '/icon-192.png', sizes: '192x192' }),
      expect.objectContaining({ src: '/icon-512.png', sizes: '512x512' }),
    ]))

    const sw = await waitForActiveServiceWorker(page)
    expect(sw).toBeTruthy()
    expect(sw.scriptURL).toMatch(/\/sw\.js$/)
    expect(sw.scope).toMatch(/\/$/)

    for (const asset of ['/icon-192.png', '/icon-512.png', '/assets/logo-horizontal.jpeg', '/assets/logo-square.png']) {
      const response = await page.request.get(asset)
      expect(response.ok()).toBeTruthy()
    }
  })

  test('1.7 PWA — shell continua acessível após perda de rede', async ({ page, context }) => {
    await page.reload()
    await expect(page.getByRole('button', { name: /^Sair$/i })).toBeVisible({
      timeout: 15_000,
    })
    const sw = await waitForActiveServiceWorker(page)
    expect(sw).toBeTruthy()

    // Segunda navegação online: o SW deve assumir o controle e o shell deve estar no cache.
    await page.reload()
    await expect(page.getByRole('button', { name: /^Sair$/i })).toBeVisible({ timeout: 15_000 })

    await context.setOffline(true)
    try {
      await page.reload()
      await expect(page.locator('body')).toBeVisible({ timeout: 15_000 })
      await expect(page).toHaveTitle(/Marcus Vinícius Porto Souza LTDA/i)
      await expect(page.getByRole('button', { name: /^Sair$/i })).toBeVisible({ timeout: 15_000 })
    } finally {
      await context.setOffline(false)
    }
  })

  test('1.8 critérios de conclusão — smoke test sem erros de console', async ({ page }) => {
    const errors = []
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text())
    })

    await page.reload()
    await expect(page.getByRole('button', { name: /^Sair$/i })).toBeVisible({ timeout: 15_000 })

    expect(errors).toEqual([])
  })
})

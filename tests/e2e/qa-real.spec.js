import { test, expect } from '@playwright/test'

const email = process.env.E2E_EMAIL
const password = process.env.E2E_PASSWORD

test.skip(!email || !password, 'Configure E2E_EMAIL e E2E_PASSWORD.')

const QA_MARKER = `QA-E2E-${Date.now()}`
const QA_EDITED = `${QA_MARKER}-EDITADO`

async function login(page) {
  await page.goto('/')
  await expect(page).toHaveTitle(/Marcus Vinícius Porto Souza LTDA/i)

  const sessionButton = page.getByRole('button', { name: /^Sair$/i })
  if (await sessionButton.isVisible().catch(() => false)) return

  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.locator('button[type="submit"]').filter({ hasText: 'Entrar' }).click()
  await expect(sessionButton).toBeVisible({ timeout: 15_000 })
}

async function waitForSync(page) {
  const conflict = page.getByRole('alert')
  await expect(conflict).not.toContainText(/versão mais recente na nuvem/i, {
    timeout: 5_000,
  }).catch(() => {})
}

async function openTransactions(page) {
  await page.getByRole('button', { name: 'Lançamentos' }).click()
  await expect(page.getByText(/registros$/i)).toBeVisible()
}

async function createTransaction(page, type, marker, value = '123,45', saveFavorite = false) {
  await openTransactions(page)
  await page.getByRole('button', { name: new RegExp(`\\+ ${type}`, 'i') }).click()

  if (type === 'Receita') {
    await page.getByLabel('Nome da Clínica *').fill(marker)
    await page.getByLabel('Descrição da Receita').selectOption({ index: 1 }).catch(() => {})
  } else if (type === 'Despesa') {
    await page.getByLabel('Tipo de Despesa *').selectOption({ index: 1 })
  } else {
    await page.getByLabel('Descrição').fill(marker)
  }

  await page.getByText('Valor *').locator('..').locator('input').fill(value)
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
  await expect(page.getByText(marker, { exact: true })).toBeVisible({ timeout: 10_000 })
}

async function expandTransaction(page, marker) {
  const text = page.getByText(marker, { exact: true })
  await expect(text).toBeVisible()
  const card = text.locator(
    'xpath=ancestor::div[.//button[contains(normalize-space(.), "▾") or contains(normalize-space(.), "▲")]][1]',
  )
  await card.getByRole('button').first().click()
  return card
}

async function deleteTransaction(page, marker) {
  const card = await expandTransaction(page, marker)
  await card.getByRole('button', { name: /Excluir/i }).click()
  await expect(page.getByText(marker, { exact: true })).toHaveCount(0)
}

test.describe('LOTE 01 — RELEASE QA / E2E CERTIFICATION', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('1.1 autenticação — sessão persistente, refresh e logout', async ({ page }) => {
    await expect(page.getByRole('button', { name: /^Sair$/i })).toBeVisible()

    await page.reload()
    await expect(page.getByRole('button', { name: /^Sair$/i })).toBeVisible({
      timeout: 15_000,
    })

    await page.getByRole('button', { name: /^Sair$/i }).click()
    await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible()

    await page.reload()
    await expect(page.locator('input[type="email"]')).toBeVisible()
  })

  test('1.1 autenticação — duas abas compartilham a sessão', async ({ page, context }) => {
    const second = await context.newPage()
    await second.goto('/')
    await expect(second.getByRole('button', { name: /^Sair$/i })).toBeVisible({
      timeout: 15_000,
    })

    await second.close()
  })

  test('1.1 recuperação de senha — fluxo de solicitação acessível', async ({ page }) => {
    await page.getByRole('button', { name: /esqueci minha senha/i }).click()
    await expect(page.getByRole('button', { name: /enviar instruções/i })).toBeVisible()
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.getByRole('button', { name: /voltar para entrar/i })).toBeVisible()
  })

  test('1.2 dados — receita, despesa, distribuição, edição e exclusão', async ({ page }) => {
    await createTransaction(page, 'Receita', QA_MARKER, '123,45', true)

    await page.getByRole('button', { name: 'Configurações' }).click()
    await page.getByText('⭐ Favoritos', { exact: true }).click()
    await expect(page.getByText(QA_MARKER, { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '✕' }).click()

    await openTransactions(page)
    const card = await expandTransaction(page, QA_MARKER)
    await card.getByRole('button', { name: /Editar/i }).click()
    await page.getByLabel('Nome da Clínica *').fill(QA_EDITED)
    await page.getByRole('button', { name: 'Salvar Alterações', exact: true }).click()
    await expect(page.getByText(QA_EDITED, { exact: true })).toBeVisible()

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

  test('1.2 dados tributários — modal exibe DAS, pró-labore, INSS, contabilidade e IRRF', async ({ page }) => {
    await page.getByRole('button', { name: 'Mais' }).click()
    await expect(page.getByText('Tributação', { exact: true })).toBeVisible()
    for (const label of ['DAS — Simples Nacional', 'Pró-labore', 'INSS do Sócio', 'Contabilidade', 'IRRF']) {
      await expect(page.getByText(label, { exact: true })).toBeVisible()
    }
  })

  test('1.3 sincronização — dado criado continua após logout/login', async ({ page }) => {
    const marker = `${QA_MARKER}-PERSIST`
    await createTransaction(page, 'Receita', marker)

    await page.getByRole('button', { name: /^Sair$/i }).click()
    await expect(page.locator('input[type="email"]')).toBeVisible()

    await login(page)
    await openTransactions(page)
    await expect(page.getByText(marker, { exact: true })).toBeVisible()

    await deleteTransaction(page, marker)
  })

  test('1.4 offline — shell continua disponível e fila local é criada', async ({ page, context }) => {
    await openTransactions(page)

    await context.setOffline(true)
    await expect(page.locator('body')).toBeVisible()

    await createTransaction(page, 'Receita', `${QA_MARKER}-OFFLINE`)
    await expect(page.getByText(/Modo offline/i)).toBeVisible()

    await context.setOffline(false)
    await expect(page.getByText(`${QA_MARKER}-OFFLINE`, { exact: true })).toBeVisible({
      timeout: 15_000,
    })

    await deleteTransaction(page, `${QA_MARKER}-OFFLINE`)
  })

  test('1.5 conflito — alteração concorrente é detectada e pode ser resolvida', async ({ page, context }) => {
    const second = await context.newPage()
    await second.goto('/')
    await expect(second.getByRole('button', { name: /^Sair$/i })).toBeVisible({
      timeout: 15_000,
    })

    await openTransactions(page)
    await openTransactions(second)

    await createTransaction(page, 'Receita', `${QA_MARKER}-A`)

    // A segunda aba foi carregada antes da alteração de A e, portanto,
    // mantém uma versão-base anterior para o optimistic concurrency check.
    await createTransaction(second, 'Receita', `${QA_MARKER}-B`)

    await expect(second.getByRole('alert')).toContainText(/versão mais recente na nuvem/i, {
      timeout: 15_000,
    })

    await second.getByRole('button', { name: /Usar versão da nuvem/i }).click()
    await expect(second.getByText(`${QA_MARKER}-A`, { exact: true })).toBeVisible({
      timeout: 15_000,
    })

    await second.close()

    await openTransactions(page)
    await deleteTransaction(page, `${QA_MARKER}-A`)
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

  test('1.7 PWA — manifest, Service Worker e shell de instalação', async ({ page }) => {
    const manifest = await page.evaluate(async () => {
      const response = await fetch('/manifest.json')
      return response.json()
    })

    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toBe('/')
    expect(manifest.scope).toBe('/')

    const sw = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return null
      const registration = await navigator.serviceWorker.ready
      return {
        active: Boolean(registration.active),
        scope: registration.scope,
        scriptURL: registration.active?.scriptURL || '',
      }
    })

    expect(sw?.active).toBeTruthy()
    expect(sw?.scriptURL).toMatch(/\/sw\.js$/)
    expect(sw?.scope).toMatch(/\/$/)

    for (const asset of ['/icon-192.png', '/icon-512.png', '/assets/logo-horizontal.jpeg', '/assets/logo-square.png']) {
      const response = await page.request.get(asset)
      expect(response.ok()).toBeTruthy()
    }
  })

  test('1.7 PWA — shell continua acessível após perda de rede', async ({ page, context }) => {
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.evaluate(() => navigator.serviceWorker?.ready)
    await context.setOffline(true)

    await page.reload()
    await expect(page.locator('body')).toBeVisible()
    await expect(page).toHaveTitle(/Marcus Vinícius Porto Souza LTDA/i)

    await context.setOffline(false)
  })

  test('1.8 critérios de conclusão — não há console error durante smoke test', async ({ page }) => {
    const errors = []
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text())
    })

    await page.reload()
    await expect(page.getByRole('button', { name: /^Sair$/i })).toBeVisible({
      timeout: 15_000,
    })

    expect(errors).toEqual([])
  })
})

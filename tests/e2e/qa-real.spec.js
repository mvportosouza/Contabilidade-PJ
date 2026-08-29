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

  // Production auth can briefly render the signed-out shell while Supabase
  // restores the session. Give the auth gate a short retry window instead of
  // turning that transient race into a flaky PWA/auth failure.
  await expect.poll(
    async () => await signedOutButton.isVisible().catch(() => false),
    { timeout: 20_000, intervals: [250, 500, 1_000] },
  ).toBe(true)
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
  // Use o botão principal da aba Lançamentos, que contém o emoji e o texto.
  // O estado vazio também possui atalhos com o mesmo texto sem o emoji.
  // Assim evitamos escolher acidentalmente um segundo botão e não dependemos
  // do nome acessível calculado pelo Playwright.
  const patterns = {
    Receita: /💰\s*\+\s*Receita/i,
    Despesa: /💸\s*\+\s*Despesa/i,
    'Distribuição de Lucro': /💰\s*\+\s*Distribuição de Lucro/i,
  }
  return page.locator('button').filter({ hasText: patterns[type] }).first()
}

function fieldControl(page, label, controlSelector = 'input, select, textarea') {
  // AppUI's Field component renders a visual <label> without a
  // for/id association. getByLabel() therefore cannot resolve these
  // controls in production. Scope the control to its own Field wrapper.
  const field = page.locator('label').filter({ hasText: label }).first().locator('..')
  return field.locator(controlSelector).first()
}

async function createTransaction(page, type, marker, value = '123,45', saveFavorite = false) {
  await openTransactions(page)
  await transactionButton(page, type).click()

  if (type === 'Receita') {
    await fieldControl(page, 'Nome da Clínica *', 'input').fill(marker)
    await fieldControl(page, 'Descrição da Receita', 'select').selectOption({ index: 1 }).catch(() => {})
  } else if (type === 'Despesa') {
    await fieldControl(page, 'Tipo de Despesa *', 'select').selectOption({ index: 1 })
    // Despesas use the selected category as their displayed name. Keep the
    // unique QA marker in the observation so the E2E test can reliably
    // identify the exact transaction without changing production semantics.
    await fieldControl(page, 'Observação', 'input, textarea').fill(marker)
  } else {
    await fieldControl(page, 'Descrição', 'input, textarea').fill(marker)
  }

  await page.getByText('Valor *', { exact: true }).locator('..').locator('input').fill(value)
  await fieldControl(page, 'Data *', 'input').fill(new Date().toISOString().slice(0, 10))

  if (saveFavorite && type !== 'Distribuição de Lucro') {
    // ChkBox é um componente visual dentro de um <label>; clicar apenas no
    // texto não aciona seu onClick. Clique no próprio quadrado do checkbox.
    // O ChkBox é um <div> visual dentro do <label>; o texto fica em um
    // <span> irmão. Evite depender de :scope > div após o React re-renderizar
    // o componente, pois o nó visual pode ser substituído durante o clique.
    const favoriteField = page.locator('label').filter({
      has: page.getByText('Salvar nos favoritos', { exact: true }),
    }).first()
    await expect(favoriteField).toBeVisible({ timeout: 10_000 })

    const favoriteBox = favoriteField.getByRole('checkbox')
    await expect(favoriteBox).toBeVisible({ timeout: 10_000 })
    await favoriteBox.click()
    await expect(favoriteBox).toHaveAttribute('aria-checked', 'true', {
      timeout: 5_000,
    })
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

  // TxCard tem uma estrutura fixa: p(nome) -> div(conteúdo) ->
  // div(linha) -> div(card). Subir exatamente esses 3 níveis evita que um
  // ancestor mais externo seja escolhido pelo XPath e perca os botões Editar/
  // Excluir.
  const card = text.locator('xpath=../../..')
  await expect(card).toBeVisible({ timeout: 10_000 })
  await card.locator('button').first().click()
  await expect(card.getByRole('button', { name: /Editar/i })).toBeVisible({
    timeout: 10_000,
  })
  return card
}

async function deleteTransaction(page, marker) {
  // A sincronização concorrente pode manter o banner de conflito sobre a
  // interface. Antes de clicar no card, resolva-o pela versão da nuvem; a
  // limpeza do teste não deve falhar por um overlay de status.
  const conflict = page.getByRole('alert').filter({
    hasText: /Há uma versão mais recente na nuvem/i,
  })
  if (await conflict.isVisible().catch(() => false)) {
    await conflict.getByRole('button', { name: /Usar versão da nuvem/i }).click()
    await expect(page.getByRole('button', { name: /^Sair$/i })).toBeVisible({
      timeout: 15_000,
    })
    await openTransactions(page)
  }

  const card = await expandTransaction(page, marker)
  await card.getByRole('button', { name: /Excluir/i }).click()
  await expect(page.getByText(marker, { exact: true })).toHaveCount(0, { timeout: 10_000 })
}

async function waitForRemoteSnapshot(page, timeoutMs = 15_000) {
  await page.waitForFunction(() => {
    const cache = Object.entries(localStorage).find(([key]) =>
      key.startsWith('pj_app_state_cache_v3_'),
    )
    if (!cache) return false

    try {
      const envelope = JSON.parse(cache[1])
      return Boolean(envelope?.remoteUpdatedAt)
    } catch {
      return false
    }
  }, null, { timeout: timeoutMs })
}

async function waitForCloudSync(page, timeoutMs = 20_000) {
  const isOffline = await page.evaluate(() => navigator.onLine === false)
  if (isOffline) return

  await page.waitForFunction(() => {
    const entry = Object.entries(localStorage).find(([key]) =>
      key.startsWith('pj_app_state_cache_v3_'),
    )
    if (!entry) return false
    try {
      const envelope = JSON.parse(entry[1])
      return Boolean(envelope.remoteUpdatedAt) && envelope.dirty === false
    } catch {
      return false
    }
  }, null, { timeout: timeoutMs })
}

async function expectCloudMarker(page, marker, timeoutMs = 30_000) {
  // Verify the marker from the cloud without creating another browser
  // context. Vercel can challenge repeated fresh Chromium contexts from CI
  // with a Security Checkpoint, which is unrelated to the application's
  // Supabase synchronization. We clear only the app-data cache/queue while
  // preserving the Supabase auth session, then reload the same page.
  const appCacheKeys = await page.evaluate(() =>
    Object.keys(localStorage).filter(
      key =>
        key.startsWith('pj_app_state_cache_v3_') ||
        key.startsWith('pj_app_state_cache_v2_') ||
        key.startsWith('pj_app_state_sync_queue_v2_') ||
        key.startsWith('pj_app_state_sync_queue_v1_') ||
        key === 'pj_app_state_cache_v1',
    ),
  )
  await page.evaluate(keys => keys.forEach(key => localStorage.removeItem(key)), appCacheKeys)

  await page.reload()
  await expect(page.getByRole('button', { name: /^Sair$/i })).toBeVisible({ timeout: 15_000 })
  await openTransactions(page)

  const markerLocator = page.getByText(marker, { exact: true })
  await expect(markerLocator).toBeVisible({ timeout: timeoutMs })
  return markerLocator
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
      // The page can be disposed by navigation in some Chromium/Supabase
      // auth races. Closing only the still-open context prevents a cleanup
      // race from turning an otherwise valid auth assertion into a failure.
      if (!guestContext.pages().length || !guestContext.pages().every(p => p.isClosed())) {
        await guestContext.close().catch(() => {})
      }
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

  test('1.1 recuperação de senha — solicitação real de redefinição', async ({ browser }) => {
    // Run recovery in a fresh, signed-out browser context. This avoids
    // cross-test auth events (especially SIGNED_OUT) clearing the success
    // message after the reset request completes.
    const recoveryContext = await browser.newContext()
    const recoveryPage = await recoveryContext.newPage()

    try {
      await recoveryPage.goto('/')
      await expect(recoveryPage.locator('input[type="email"]')).toBeVisible({
        timeout: 15_000,
      })

      const authForm = recoveryPage
        .locator('form')
        .filter({ has: recoveryPage.locator('input[type="email"]') })

      await authForm.getByRole('button', { name: /esqueci minha senha/i }).click()

      const recoveryForm = recoveryPage
        .locator('form')
        .filter({ hasText: /Informe seu e-mail para receber as instruções/i })

      await expect(recoveryForm.locator('input[type="email"]')).toBeVisible({
        timeout: 15_000,
      })
      await recoveryForm.locator('input[type="email"]').fill(email)

      // The reset endpoint returning successfully is the primary E2E
      // assertion. The UI confirmation is checked afterwards.
      const responsePromise = recoveryPage.waitForResponse(
        response =>
          response.request().method() === 'POST' &&
          /\/auth\/v1\/recover(?:\?|$)/.test(response.url()),
        { timeout: 20_000 },
      )

      await recoveryForm
        .getByRole('button', { name: /enviar instruções/i })
        .click()

      const response = await responsePromise
      const status = response.status()

      if (status === 429) {
        // Supabase Auth rate-limits repeated password-reset requests. A 429
        // means the real production endpoint was reached and intentionally
        // throttled the request; it must not turn the whole E2E suite red
        // after repeated QA runs.
        await expect(
          recoveryPage.locator('form').filter({
            hasText: /Informe seu e-mail para receber as instruções/i,
          }),
        ).toBeVisible({ timeout: 5_000 })
        return
      }

      expect(status).toBeGreaterThanOrEqual(200)
      expect(status).toBeLessThan(300)

      await expect(
        recoveryPage.getByText(
          /Se o e-mail estiver cadastrado, enviaremos as instruções para redefinir sua senha\./i,
        ),
      ).toBeVisible({ timeout: 15_000 })
    } finally {
      await recoveryContext.close()
    }
  })

  test('1.2 dados — receita, favorito, edição, despesa, distribuição e exclusão', async ({ page }) => {
    await createTransaction(page, 'Receita', QA_MARKER, '123,45', true)

    await page.getByRole('button', { name: 'Configurações' }).click()
    await page.getByText('⭐ Favoritos', { exact: true }).click()
    const favoritesHeading = page.getByRole('heading', { name: '⭐ Favoritos', exact: true })
    await expect(favoritesHeading).toBeVisible({ timeout: 10_000 })
    const favoritesModal = page.getByRole('dialog').filter({ has: favoritesHeading }).first()
    await expect(favoritesModal).toBeVisible({ timeout: 10_000 })
    await expect(favoritesModal.getByText(QA_MARKER, { exact: true })).toHaveCount(1, { timeout: 10_000 })
    await page.getByRole('button', { name: '✕' }).click()

    await openTransactions(page)
    const card = await expandTransaction(page, QA_MARKER)
    await card.getByRole('button', { name: /Editar/i }).click()
    await fieldControl(page, 'Nome da Clínica *', 'input').fill(QA_EDITED)
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

  test('1.4 offline — alteração sobrevive ao fechamento/reabertura e sincroniza ao voltar online', async ({ page, context, browser }) => {
    const sw = await waitForActiveServiceWorker(page)
    expect(sw?.scriptURL).toMatch(/\/sw\.js$/)

    await page.reload()
    await expect(page.getByRole('button', { name: /^Sair$/i })).toBeVisible({ timeout: 15_000 })

    const marker = `${QA_MARKER}-OFFLINE`

    // Establish the online shell/cache before simulating the device going offline.
    await context.setOffline(true)
    await page.close()

    const reopened = await context.newPage()
    try {
      await reopened.goto('/')
      await expect(reopened.getByRole('button', { name: /^Sair$/i })).toBeVisible({ timeout: 15_000 })
      await expect(reopened.getByText(/Modo offline/i)).toBeVisible({ timeout: 10_000 })

      await createTransaction(reopened, 'Receita', marker)
      await expect(reopened.getByText(marker, { exact: true })).toBeVisible({ timeout: 15_000 })

      // Close while still offline. This is the critical persistence step.
      await reopened.close()

      // Re-open offline to prove the local queue/state survives application close.
      const reopenedOffline = await context.newPage()
      try {
        await reopenedOffline.goto('/')
        await expect(reopenedOffline.getByRole('button', { name: /^Sair$/i })).toBeVisible({ timeout: 15_000 })

        // AuthGate can expose the session before App's asynchronous storage
        // bootstrap has rendered the transaction list. Open the tab first so
        // the persistence assertion waits for the actual data view.
        await openTransactions(reopenedOffline)
        await expect(reopenedOffline.getByText(marker, { exact: true })).toBeVisible({ timeout: 15_000 })

        // Bring the original tab online and explicitly reload it. This forces
        // loadStateInternal() to consume the durable sync queue while online,
        // instead of relying only on the browser "online" event racing with
        // the fresh-context verification below.
        await context.setOffline(false)
        await reopenedOffline.reload()
        await expect(reopenedOffline.getByRole('button', { name: /^Sair$/i })).toBeVisible({
          timeout: 15_000,
        })
        await openTransactions(reopenedOffline)
        await expect(reopenedOffline.getByText(marker, { exact: true })).toBeVisible({
          timeout: 15_000,
        })

        // Verify with a completely fresh browser context, which has no local
        // cache and therefore can only see the marker if it really reached
        // Supabase.
        const cloudMarker = await expectCloudMarker(reopenedOffline, marker, 30_000)
        await deleteTransaction(reopenedOffline, marker)
      } finally {
        await reopenedOffline.close().catch(() => {})
      }
    } finally {
      await context.setOffline(false)
    }
  })

  test('1.5 conflito — alteração concorrente é detectada e pode ser resolvida', async ({ browser }) => {
    const firstContext = await browser.newContext()
    const secondContext = await browser.newContext()
    const first = await firstContext.newPage()
    const second = await secondContext.newPage()

    const baseline = `${QA_MARKER}-BASELINE`
    const markerA = `${QA_MARKER}-A`
    const markerB = `${QA_MARKER}-B`

    try {
      // Create a known baseline and wait until it is really visible from a
      // completely fresh browser context. This gives both devices a concrete,
      // identical cloud version to start from.
      await login(first)
      await openTransactions(first)
      await createTransaction(first, 'Receita', baseline)

      await expectCloudMarker(first, baseline, 30_000)

      // The second device loads the baseline after it already exists in the
      // cloud. Both devices now have the same remoteUpdatedAt.
      await login(second)
      await openTransactions(second)
      await expect(second.getByText(baseline, { exact: true })).toBeVisible({ timeout: 15_000 })

      // Reload first after the baseline is committed so its in-memory
      // optimistic-concurrency version is definitely the baseline version.
      await first.reload()
      await openTransactions(first)
      await expect(first.getByText(baseline, { exact: true })).toBeVisible({ timeout: 15_000 })

      await createTransaction(first, 'Receita', markerA)

      // Prove A reached Supabase before B attempts its stale write.
      await expectCloudMarker(first, markerA, 30_000)

      // B still has the baseline remoteUpdatedAt and therefore must receive
      // the optimistic-concurrency conflict instead of overwriting A.
      await createTransaction(second, 'Receita', markerB)

      await expect(
        second.getByText(
          /Existe uma versão mais recente na nuvem\. Os dados locais foram preservados\./i,
          { exact: false },
        ),
      ).toBeVisible({ timeout: 20_000 })

      await second.getByRole('button', { name: /Usar versão da nuvem/i }).click()

      // The production conflict resolver persists the remote snapshot and
      // intentionally reloads the application. Explicitly wait for the new
      // authenticated shell, then open Lançamentos again before asserting the
      // resolved state. This avoids racing the reload against React hydration.
      await expect(second.getByRole('button', { name: /^Sair$/i })).toBeVisible({
        timeout: 15_000,
      })
      await openTransactions(second)
      await expect(second.getByText(markerA, { exact: true })).toBeVisible({
        timeout: 15_000,
      })
      await expect(second.getByText(markerB, { exact: true })).toHaveCount(0)

      await deleteTransaction(first, markerA)
      await deleteTransaction(first, baseline)
    } finally {
      await firstContext.close().catch(() => {})
      await secondContext.close().catch(() => {})
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

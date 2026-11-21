import { pathToFileURL } from 'node:url'

const playwrightEntry = process.env.NFSE_NODE_PATH
  ? pathToFileURL(`${process.env.NFSE_NODE_PATH}/playwright/index.mjs`).href
  : 'playwright'
const { chromium } = await import(playwrightEntry)

const baseUrl = process.env.NFSE_API_BASE_URL?.replace(/\/$/, '')
const bridgeToken = process.env.NFSE_WORKER_BRIDGE_TOKEN
const runId = process.env.NFSE_RUN_ID

if (!baseUrl || !bridgeToken || !runId) throw new Error('NFSE_WORKER_ENV_MISSING')

async function api(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      'x-nfse-worker-token': bridgeToken,
      ...(options.headers || {}),
    },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `NFSE_API_${response.status}`)
  return data
}

async function setStatus(status, errorCode) {
  return api('/api/nfse/worker', {
    method: 'POST',
    body: JSON.stringify({ runId, status, errorCode }),
  })
}

async function clickVisibleOtpConfirm(page) {
  const buttons = page.getByRole('button', { name: /confirmar|verificar|validar|continuar|enviar/i })
  const count = await buttons.count()

  // Não usar .last(): a página pode conter botões duplicados/ocultos para outros layouts.
  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index)
    const visible = await button.isVisible().catch(() => false)
    const enabled = await button.isEnabled().catch(() => false)
    if (visible && enabled) {
      await button.click({ timeout: 10000 })
      return
    }
  }

  // Fallback apenas se o formulário tiver um botão submit visível e habilitado.
  const submit = page.locator('button[type="submit"]:visible').last()
  if (await submit.count() && await submit.isEnabled().catch(() => false)) {
    await submit.click({ timeout: 10000 })
    return
  }

  throw new Error('OTP_CONFIRM_BUTTON_NOT_FOUND')
}

async function waitForOtp(page) {
  await setStatus('awaiting_otp')
  const deadline = Date.now() + 3 * 60 * 1000

  while (Date.now() < deadline) {
    const { code } = await api(`/api/nfse/worker?runId=${encodeURIComponent(runId)}&action=otp`)
    if (code) {
      const inputs = page.locator('input:visible')
      const candidates = await inputs.count()
      const otpInputs = []

      for (let i = 0; i < candidates; i += 1) {
        const input = inputs.nth(i)
        const maxLength = await input.getAttribute('maxlength')
        const inputType = await input.getAttribute('type')
        const autocomplete = await input.getAttribute('autocomplete')
        if (maxLength === '1' || autocomplete === 'one-time-code' || inputType === 'tel') {
          otpInputs.push(input)
        }
      }

      if (otpInputs.length >= 6) {
        for (let i = 0; i < 6; i += 1) await otpInputs[i].fill(code[i])
      } else {
        const candidatesText = page.locator('input:visible, textarea:visible')
        const count = await candidatesText.count()
        let filled = false
        for (let i = count - 1; i >= 0; i -= 1) {
          const field = candidatesText.nth(i)
          const type = await field.getAttribute('type')
          const name = await field.getAttribute('name') || ''
          const placeholder = await field.getAttribute('placeholder') || ''
          if (type === 'password' || /senha|password/i.test(name + ' ' + placeholder)) continue
          if (await field.isEditable().catch(() => false)) {
            await field.fill(code)
            filled = true
            break
          }
        }
        if (!filled) throw new Error('OTP_FIELD_NOT_FOUND')
      }

      await setStatus('validating_access')
      await clickVisibleOtpConfirm(page)
      return
    }
    await page.waitForTimeout(2000)
  }
  throw new Error('OTP_TIMEOUT')
}

async function inspectPage(page) {
  const title = await page.title().catch(() => '')
  const url = page.url()
  const bodyText = (await page.locator('body').innerText({ timeout: 5000 }).catch(() => '')).slice(0, 5000)
  const buttons = await page.locator('button:visible').evaluateAll(items => items.map(button => ({
    text: (button.innerText || button.getAttribute('aria-label') || '').trim().slice(0, 100),
    disabled: Boolean(button.disabled),
    type: button.getAttribute('type') || '',
  }))).catch(() => [])
  return { title, url, bodyText, buttons }
}

async function waitForAuthenticationOutcome(page) {
  const deadline = Date.now() + 60000
  const successPatterns = [
    /central de rotinas/i,
    /notas fiscais/i,
    /dashboard/i,
    /bem-vind[oa]/i,
    /minha conta/i,
    /visão geral/i,
  ]
  const rejectionPatterns = [
    /código inválido/i,
    /código expirado/i,
    /não foi possível validar/i,
    /código incorreto/i,
  ]

  while (Date.now() < deadline) {
    const state = await inspectPage(page)
    const normalized = state.bodyText.replace(/\s+/g, ' ').trim()

    if (rejectionPatterns.some((pattern) => pattern.test(normalized))) {
      throw new Error('OTP_REJECTED')
    }

    const otpStillVisible = await page.getByText(/insira o código de verificação|código de verificação/i).first()
      .isVisible().catch(() => false)
    const passwordStillVisible = await page.getByLabel(/senha/i).first().isVisible().catch(() => false)

    if (!otpStillVisible && !passwordStillVisible && successPatterns.some((pattern) => pattern.test(normalized))) {
      return state
    }

    if (!otpStillVisible && !passwordStillVisible && !/login|sign.?in|autentica/i.test(new URL(state.url).pathname)) {
      return state
    }
    await page.waitForTimeout(1500)
  }

  throw new Error('AUTH_OUTCOME_TIMEOUT')
}

let browser
let page
let diagnostic = null

try {
  const job = await api(`/api/nfse/worker?runId=${encodeURIComponent(runId)}&action=claim`)
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  page = await context.newPage()
  await page.goto('https://app.contabilizei.com.br/', { waitUntil: 'domcontentloaded', timeout: 60000 })

  const emailField = page.getByLabel(/usuário|e-mail|cpf/i).first()
  const passwordField = page.getByLabel(/senha/i).first()
  await emailField.fill(job.credentials.email)
  await passwordField.fill(job.credentials.password)
  await page.getByRole('button', { name: /^entrar$/i }).click()

  await page.getByText(/insira o código de verificação/i).waitFor({ state: 'visible', timeout: 30000 })
  await waitForOtp(page)

  diagnostic = await waitForAuthenticationOutcome(page)
  // Esta etapa confirma somente autenticação. Emissão permanece desabilitada.
  await setStatus('completed')
} catch (error) {
  const code = String(error?.message || 'WORKER_FAILED').replace(/[^A-Z0-9_:-]/gi, '_').slice(0, 80)
  if (page) {
    diagnostic = await inspectPage(page).catch(() => null)
    // Remove qualquer OTP de campos antes da captura para não guardar códigos de autenticação no artefato.
    await page.locator('input').evaluateAll(items => items.forEach(input => {
      if (input.type !== 'password') input.value = ''
    })).catch(() => {})
    await page.screenshot({ path: 'nfse-auth-failure.png', fullPage: true }).catch(() => {})
  }
  if (diagnostic) {
    console.error('[nfse.auth.diagnostic]', JSON.stringify({
      title: diagnostic.title,
      url: diagnostic.url,
      bodyText: diagnostic.bodyText,
      visibleButtons: diagnostic.buttons,
      error: code,
    }))
  }
  try { await setStatus('failed', code) } catch { /* preserve original failure */ }
  process.exitCode = 1
} finally {
  if (browser) await browser.close().catch(() => {})
}

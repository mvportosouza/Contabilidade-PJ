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

async function waitForOtp(page) {
  await setStatus('awaiting_otp')
  const deadline = Date.now() + 3 * 60 * 1000
  while (Date.now() < deadline) {
    const { code } = await api(`/api/nfse/worker?runId=${encodeURIComponent(runId)}&action=otp`)
    if (code) {
      const inputs = page.locator('input').filter({ visible: true })
      const candidates = await inputs.count()
      const otpInputs = []
      for (let i = 0; i < candidates; i += 1) {
        const input = inputs.nth(i)
        const maxLength = await input.getAttribute('maxlength')
        if (maxLength === '1') otpInputs.push(input)
      }
      if (otpInputs.length >= 6) {
        for (let i = 0; i < 6; i += 1) await otpInputs[i].fill(code[i])
      } else {
        const otpField = page.getByRole('textbox').filter({ visible: true }).last()
        await otpField.fill(code)
      }
      await setStatus('validating_access')
      const confirm = page.getByRole('button', { name: /confirmar/i }).last()
      await confirm.click()
      return
    }
    await page.waitForTimeout(2000)
  }
  throw new Error('OTP_TIMEOUT')
}

let browser
try {
  const job = await api(`/api/nfse/worker?runId=${encodeURIComponent(runId)}&action=claim`)
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  await page.goto('https://app.contabilizei.com.br/', { waitUntil: 'domcontentloaded', timeout: 60000 })

  const emailField = page.getByLabel(/usuário|e-mail|cpf/i).first()
  const passwordField = page.getByLabel(/senha/i).first()
  await emailField.fill(job.credentials.email)
  await passwordField.fill(job.credentials.password)
  await page.getByRole('button', { name: /^entrar$/i }).click()

  await page.getByText(/insira o código de verificação/i).waitFor({ state: 'visible', timeout: 30000 })
  await waitForOtp(page)

  await Promise.race([
    page.getByText(/central de rotinas|notas fiscais/i).first().waitFor({ state: 'visible', timeout: 45000 }),
    page.getByText(/código inválido|código expirado/i).first().waitFor({ state: 'visible', timeout: 45000 }).then(() => { throw new Error('OTP_REJECTED') }),
  ])

  // Marco apenas a validação do acesso. Nenhuma nota é preenchida ou emitida nesta fase.
  await setStatus('completed')
} catch (error) {
  const code = String(error?.message || 'WORKER_FAILED').replace(/[^A-Z0-9_:-]/gi, '_').slice(0, 80)
  try { await setStatus('failed', code) } catch { /* preserve original failure */ }
  process.exitCode = 1
} finally {
  if (browser) await browser.close().catch(() => {})
}

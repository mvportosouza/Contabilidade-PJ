import { pathToFileURL } from 'node:url'
import { buildNfseDraft } from './preview-mapping.mjs'
import { inspectContabilizeiForm, inspectContabilizeiMenu } from './contabilizei-preview.mjs'

const playwrightEntry = process.env.NFSE_NODE_PATH ? pathToFileURL(`${process.env.NFSE_NODE_PATH}/playwright/index.mjs`).href : 'playwright'
const { chromium } = await import(playwrightEntry)
const baseUrl = process.env.NFSE_API_BASE_URL?.replace(/\/$/, '')
const bridgeToken = process.env.NFSE_WORKER_BRIDGE_TOKEN
const runId = process.env.NFSE_RUN_ID
if (!baseUrl || !bridgeToken || !runId) throw new Error('NFSE_WORKER_ENV_MISSING')

async function api(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { 'content-type':'application/json', 'x-nfse-worker-token':bridgeToken, ...(options.headers||{}) } })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `NFSE_API_${response.status}`)
  return data
}
const setStatus = (status, extra = {}) => api('/api/nfse/worker', { method:'POST', body:JSON.stringify({ runId, status, ...extra }) })

async function clickOtpConfirm(page) {
  const confirm = page.getByRole('button', { name:/^confirmar$/i })
  if (await confirm.count() !== 1 || !await confirm.isVisible().catch(() => false) || !await confirm.isEnabled().catch(() => false)) {
    throw new Error('OTP_CONFIRM_BUTTON_NOT_UNIQUE')
  }
  await confirm.click({ timeout:10000 })
}
async function waitForOtp(page) {
  await setStatus('awaiting_otp')
  const deadline = Date.now() + 180000
  while (Date.now() < deadline) {
    const { code } = await api(`/api/nfse/worker?runId=${encodeURIComponent(runId)}&action=otp`)
    if (code) {
      const inputs = page.locator('input:visible')
      const otp = []
      for (let i=0, n=await inputs.count(); i<n; i++) {
        const el = inputs.nth(i)
        if (await el.getAttribute('maxlength') === '1' || await el.getAttribute('autocomplete') === 'one-time-code') otp.push(el)
      }
      if (otp.length === 6) {
        for (let i=0; i<6; i++) await otp[i].fill(code[i])
      } else {
        const eligible = []
        for (let i=0, n=await inputs.count(); i<n; i++) {
          const el = inputs.nth(i)
          const type = await el.getAttribute('type')
          const meta = `${await el.getAttribute('name') || ''} ${await el.getAttribute('placeholder') || ''}`
          if (type !== 'password' && !/senha|password/i.test(meta) && await el.isEditable().catch(() => false)) eligible.push(el)
        }
        if (eligible.length !== 1) throw new Error('OTP_FIELD_NOT_UNIQUE')
        await eligible[0].fill(code)
      }
      await setStatus('validating_access')
      await clickOtpConfirm(page)
      return
    }
    await page.waitForTimeout(2000)
  }
  throw new Error('OTP_TIMEOUT')
}
async function waitAuth(page) {
  const deadline = Date.now() + 60000
  while (Date.now() < deadline) {
    const text = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ')
    if (/código inválido|código expirado|código incorreto|não foi possível validar/i.test(text)) throw new Error('OTP_REJECTED')
    const otpVisible = await page.getByText(/insira o código de verificação/i).first().isVisible().catch(() => false)
    const passwordVisible = await page.getByLabel(/senha/i).first().isVisible().catch(() => false)
    const loginUrl = /\/login(?:\/|$)/i.test(new URL(page.url()).pathname)
    if (!otpVisible && !passwordVisible && !loginUrl) return
    await page.waitForTimeout(1200)
  }
  throw new Error('AUTH_OUTCOME_TIMEOUT')
}
function safeFieldNames(state) {
  return [
    ...(state.fields || []).map(x => [x.tag,x.role,x.type,x.label,x.aria,x.placeholder,x.name,x.testId].filter(Boolean).join(':')),
    ...(state.buttons || []).map(x => `button:${x.label}:${x.testId}`),
    ...(state.headings || []).map(x => `label:${x}`),
  ].filter(Boolean).map(x => x.slice(0,120)).slice(0,40)
}
function formattedTaxId(digits) {
  if (digits.length === 14) return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  if (digits.length === 11) return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  throw new Error('INVALID_CUSTOMER_TAX_ID_LENGTH')
}
async function closeKnownAccountPanel(page) {
  const close = page.locator('[data-testid="box-conta-usuario-fechar"]')
  const count = await close.count().catch(() => 0)
  if (count !== 1 || !await close.isVisible().catch(() => false)) return { found:false, closed:false }
  try {
    // Exact test id observed in the real Contabilizei run; force is limited to this
    // non-destructive close control, never used on issuance or fiscal controls.
    await close.click({ timeout:5000, force:true })
    await page.waitForTimeout(400)
    return { found:true, closed:!(await close.isVisible().catch(() => false)) }
  } catch {
    return { found:true, closed:false }
  }
}
async function waitForHash(page, hashPart, timeout = 20000) {
  await page.waitForFunction(part => location.hash.includes(part), hashPart, { timeout })
}
let browser
try {
  const job = await api(`/api/nfse/worker?runId=${encodeURIComponent(runId)}&action=claim`)
  const tx = job.payload?.[0]
  const draft = buildNfseDraft(tx)

  browser = await chromium.launch({ headless:true })
  const context = await browser.newContext({ viewport:{ width:1440, height:1000 } })
  const page = await context.newPage()

  await page.goto('https://app.contabilizei.com.br/', { waitUntil:'domcontentloaded', timeout:60000 })
  await page.getByLabel(/usuário \(e-mail ou cpf\)|usuário|e-mail ou cpf|e-mail/i).first().fill(job.credentials.email)
  await page.getByLabel(/^senha$/i).first().fill(job.credentials.password)
  await page.getByRole('button', { name:/^entrar$/i }).click()
  await page.getByText(/insira o código de verificação/i).waitFor({ state:'visible', timeout:30000 })
  await waitForOtp(page)
  await waitAuth(page)
  await setStatus('preparing_draft')

  const accountPanel = await closeKnownAccountPanel(page)

  // Notebook screenshots prove this authenticated SPA route:
  // /painel-de-controle/#/emissor/listagem
  // Navigate by the observed route instead of guessing a sidebar element.
  await page.goto('https://app.contabilizei.com.br/painel-de-controle/#/emissor/listagem', {
    waitUntil:'domcontentloaded',
    timeout:60000,
  })
  await waitForHash(page, '/emissor/listagem')
  const issueButtonCandidates = page.getByRole('button', { name:/emitir nova nota/i })
  // The SPA can keep duplicate responsive/hidden controls in the DOM. Count
  // only controls that are actually visible and enabled before deciding.
  const visibleIssueButtonIndexes = await issueButtonCandidates.evaluateAll(elements =>
    elements.map((element, index) => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      const visible = style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity || 1) > 0
        && rect.width > 0
        && rect.height > 0
      const enabled = !element.disabled && element.getAttribute('aria-disabled') !== 'true'
      return visible && enabled ? index : -1
    }).filter(index => index >= 0)
  )
  if (visibleIssueButtonIndexes.length !== 1) {
    throw new Error(`INVOICE_LIST_EMIT_NEW_BUTTON_NOT_UNIQUE_${visibleIssueButtonIndexes.length}`)
  }
  await issueButtonCandidates.nth(visibleIssueButtonIndexes[0]).click({ timeout:12000 })
  await waitForHash(page, '/emissor/tomadores')

  // Search only by the exact document from the selected app transaction.
  const customerSearch = page.getByPlaceholder(/busque pelo nome, e-mail, CPF ou CNPJ/i)
  if (await customerSearch.count() !== 1) throw new Error('CUSTOMER_SEARCH_NOT_UNIQUE')
  await customerSearch.fill(draft.customer.taxId)
  await page.waitForTimeout(900)

  const documentLabel = formattedTaxId(draft.customer.taxId)
  const matchingDocument = page.getByText(documentLabel, { exact:true })
  const matchCount = await matchingDocument.count().catch(() => 0)
  if (matchCount !== 1 || !await matchingDocument.first().isVisible().catch(() => false)) {
    throw new Error(`CUSTOMER_DOCUMENT_MATCH_NOT_UNIQUE_${matchCount}`)
  }
  await matchingDocument.first().click({ timeout:12000 })
  await waitForHash(page, '/emissor/emitir')

  const form = await inspectContabilizeiForm(page)
  const state = await inspectContabilizeiMenu(page)
  if (!form.invoiceFormDetected) throw new Error('CONTABILIZEI_INVOICE_FORM_NOT_RECOGNIZED')

  // Stop at the form. Do not fill, continue, review, save or issue.
  await setStatus('preview_ready', { result:{
    phase:'form_discovery',
    issuance_enabled:false,
    transaction_id:String(tx.id),
    invoice_form_detected:true,
    detected_fields:safeFieldNames(form),
    menu_candidate_count:state.candidates.length,
    menu_candidates:state.candidates,
    page_title:form.title,
    page_path:form.url,
  }})
  console.log('[nfse.discovery] form_discovery_ready', JSON.stringify({ account_panel_closed:accountPanel.closed, route:'/emissor/emitir', field_count:safeFieldNames(form).length }))
} catch (error) {
  const code = String(error?.message || 'WORKER_FAILED').replace(/[^A-Z0-9_:-]/gi, '_').slice(0,80)
  try { await setStatus('failed', { errorCode:code }) } catch {}
  console.error('[nfse.discovery]', code)
  process.exitCode = 1
} finally {
  if (browser) await browser.close().catch(() => {})
}

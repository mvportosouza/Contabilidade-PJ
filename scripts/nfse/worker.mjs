import { pathToFileURL } from 'node:url'
import { mkdir } from 'node:fs/promises'
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
    // Reject only explicit OTP errors. Generic page text such as
    // "não foi possível validar" is not sufficient evidence of OTP rejection.
    if (/código inválido|código expirado|código incorreto|invalid code|expired code|incorrect code/i.test(text)) {
      throw new Error('OTP_REJECTED')
    }
    const otpVisible = await page.getByText(/insira o código de verificação/i).first().isVisible().catch(() => false)
    const passwordVisible = await page.getByLabel(/senha/i).first().isVisible().catch(() => false)
    const loginUrl = /\/login(?:\/|$)/i.test(new URL(page.url()).pathname)
    if (!otpVisible && !passwordVisible && !loginUrl) return
    await page.waitForTimeout(1200)
  }

  // Preserve evidence when the authentication outcome is ambiguous.
  try {
    await captureDiagnostic(page, 'auth-outcome-timeout')
    console.error('[nfse.auth.diagnostic]', JSON.stringify({
      url:page.url(),
      title:await page.title().catch(() => ''),
      otp_prompt_visible:await page.getByText(/insira o código de verificação/i).first().isVisible().catch(() => false),
      password_field_visible:await page.getByLabel(/senha/i).first().isVisible().catch(() => false),
    }))
  } catch (captureError) {
    console.error('[nfse.auth.diagnostic.capture_failed]', String(captureError?.message || captureError))
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
  const value = String(digits || '').replace(/\D/g, '')
  if (value.length === 14) return value.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  if (value.length === 11) return value.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  throw new Error('INVALID_CUSTOMER_TAX_ID_LENGTH')
}
async function closeKnownAccountPanel(page) {
  const close = page.locator('[data-testid="box-conta-usuario-fechar"]')
  const count = await close.count().catch(() => 0)
  if (count !== 1 || !await close.isVisible().catch(() => false)) return { found:false, closed:false }
  try {
    await close.click({ timeout:5000, force:true })
    await page.waitForTimeout(400)
    return { found:true, closed:!(await close.isVisible().catch(() => false)) }
  } catch {
    return { found:true, closed:false }
  }
}
async function dismissKnownBillingNotice(page) {
  const notice = page.getByText(/sua mensalidade está atrasada/i).first()
  const present = await notice.isVisible().catch(() => false)
  if (!present) return { present:false, dismissed:false, reason:'notice_not_visible' }
  await captureDiagnostic(page, 'billing-notice-before')

  // Only dismiss the exact informational notice. Never click payment,
  // regularization, subscription, or other account-management controls.
  const acknowledge = page.getByRole('button', { name:/^entendi$/i })
  const count = await acknowledge.count().catch(() => 0)
  if (count !== 1 || !await acknowledge.isVisible().catch(() => false)
      || !await acknowledge.isEnabled().catch(() => false)) {
    return { present:true, dismissed:false, reason:'acknowledge_button_not_unique' }
  }

  try {
    await acknowledge.click({ timeout:5000 })
    await notice.waitFor({ state:'hidden', timeout:5000 })
    return { present:true, dismissed:true, reason:'informational_notice_acknowledged' }
  } catch {
    return { present:true, dismissed:false, reason:'notice_did_not_close' }
  }
}
async function waitForHash(page, hashPart, timeout = 20000) {
  await page.waitForFunction(part => location.hash.includes(part), hashPart, { timeout })
}
async function findVisibleEmitNewControl(page) {
  const selector = 'button,a,[role="button"],[role="link"],input[type="button"],input[type="submit"],[data-testid]'
  const locator = page.locator(selector)
  const candidates = await locator.evaluateAll(elements => {
    const norm = value => String(value || '').replace(/\s+/g, ' ').trim()
    const visible = element => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity || 1) > 0
        && rect.width > 0
        && rect.height > 0
    }
    const matches = []
    elements.forEach((element, index) => {
      if (!visible(element)) return
      const label = norm(element.innerText || element.value || element.getAttribute('aria-label') || element.getAttribute('title'))
      if (!/emitir\s*nova\s*nota/i.test(label)) return
      const enabled = !element.disabled && element.getAttribute('aria-disabled') !== 'true'
      matches.push({
        index,
        tag:element.tagName.toLowerCase(),
        role:element.getAttribute('role') || '',
        label:label.slice(0,100),
        testId:(element.getAttribute('data-testid') || '').slice(0,80),
        href:(element.getAttribute('href') || '').slice(0,160),
        enabled
      })
    })
    // Prefer the smallest semantic clickable control; remove matching ancestor
    // wrappers when a more specific matching clickable descendant exists.
    return matches.filter(candidate => {
      const el = elements[candidate.index]
      return !matches.some(other => {
        if (other.index === candidate.index) return false
        const child = elements[other.index]
        return el.contains(child) && child !== el
      })
    })
  }).catch(() => [])
  return { locator, candidates }
}
async function saveMenuDiagnostic(tx, page, phase = 'menu_diagnostic', extra = {}) {
  const state = await inspectContabilizeiMenu(page)
  const form = await inspectContabilizeiForm(page)
  await captureDiagnostic(page, phase)
  await setStatus('preview_ready', { result:{
    phase,
    ...extra,
    issuance_enabled:false,
    transaction_id:String(tx.id),
    invoice_form_detected:form.invoiceFormDetected === true,
    detected_fields:safeFieldNames(form),
    menu_candidate_count:state.candidates.length,
    menu_candidates:state.candidates,
    page_title:form.title || state.title,
    page_path:form.url || state.url,
  }})
}
let browser
let page
async function captureDiagnostic(pageRef, label) {
  if (!pageRef) return null
  try {
    await mkdir('nfse-diagnostics', { recursive:true })
    const safeRunId = String(runId).replace(/[^a-zA-Z0-9_-]/g, '_')
    const safeLabel = String(label).replace(/[^a-zA-Z0-9_-]/g, '_')
    const path = `nfse-diagnostics/${safeRunId}-${Date.now()}-${safeLabel}.png`
    await pageRef.screenshot({ path, fullPage:true, animations:'disabled', timeout:15000 })
    console.log('[nfse.screenshot]', path)
    return path
  } catch (error) {
    console.error('[nfse.screenshot.failed]', label, String(error?.message || error))
    return null
  }
}
try {
  const job = await api(`/api/nfse/worker?runId=${encodeURIComponent(runId)}&action=claim`)
  const tx = job.payload?.[0]
  const draft = buildNfseDraft(tx)

  browser = await chromium.launch({ headless:true })
  const context = await browser.newContext({ viewport:{ width:1440, height:1000 } })
  page = await context.newPage()

  await page.goto('https://app.contabilizei.com.br/', { waitUntil:'domcontentloaded', timeout:60000 })
  await page.getByLabel(/usuário \(e-mail ou cpf\)|usuário|e-mail ou cpf|e-mail/i).first().fill(job.credentials.email)
  await page.getByLabel(/^senha$/i).first().fill(job.credentials.password)
  await page.getByRole('button', { name:/^entrar$/i }).click()
  await page.getByText(/insira o código de verificação/i).waitFor({ state:'visible', timeout:30000 })
  await waitForOtp(page)
  await waitAuth(page)
  await setStatus('preparing_draft')

  const accountPanel = await closeKnownAccountPanel(page)

  // Exact SPA route observed in the notebook screenshots.
  await page.goto('https://app.contabilizei.com.br/painel-de-controle/#/emissor/listagem', {
    waitUntil:'domcontentloaded',
    timeout:60000,
  })
  await waitForHash(page, '/emissor/listagem')

  // The notebook screenshot shows this as a blue action, but the site may
  // render it as an anchor or custom clickable element rather than <button>.
  // Wait for the text, then search all visible interactive element types.
  await page.getByText(/emitir\s*nova\s*nota/i).first().waitFor({ state:'visible', timeout:15000 }).catch(() => {})
  await page.waitForTimeout(800)
  const issueControl = await findVisibleEmitNewControl(page)

  if (issueControl.candidates.length !== 1 || !issueControl.candidates[0].enabled) {
    // Save the actual controls found on the list page instead of ending with
    // an opaque auth failure. No click is attempted when the target is unclear.
    await saveMenuDiagnostic(tx, page, 'menu_diagnostic')
    console.log('[nfse.discovery] emit_new_control_candidates', JSON.stringify(issueControl.candidates))
    process.exitCode = 0
  } else {
    await issueControl.locator.nth(issueControl.candidates[0].index).click({ timeout:12000 })
    await waitForHash(page, '/emissor/tomadores')

    const customerSearch = page.getByPlaceholder(/busque pelo nome, e-mail, CPF ou CNPJ/i)
    if (await customerSearch.count() !== 1 || !await customerSearch.isVisible().catch(() => false)) {
      throw new Error('CUSTOMER_SEARCH_NOT_UNIQUE')
    }
    await customerSearch.fill(draft.customer.taxId)
    await page.waitForTimeout(1000)

    const documentLabel = formattedTaxId(draft.customer.taxId)
    const matchingDocument = page.getByText(documentLabel, { exact:true })
    const matchCount = await matchingDocument.count().catch(() => 0)
    if (matchCount !== 1 || !await matchingDocument.first().isVisible().catch(() => false)) {
      throw new Error(`CUSTOMER_DOCUMENT_MATCH_NOT_UNIQUE_${matchCount}`)
    }
    await matchingDocument.first().click({ timeout:12000 })
    await waitForHash(page, '/emissor/emitir')
    await page.waitForLoadState('domcontentloaded', { timeout:8000 }).catch(() => {})
    await page.waitForTimeout(700)

    // The account notice can appear after customer selection. Handle only
    // its exact acknowledgement button, then re-check the invoice form.
    const billingNotice = await dismissKnownBillingNotice(page)
    if (page.url().includes('/emissor/') && !page.url().includes('#/emissor/emitir')) {
      throw new Error('INVOICE_ROUTE_CHANGED_AFTER_ACCOUNT_NOTICE')
    }
    await page.waitForTimeout(500)
    const form = await inspectContabilizeiForm(page)
    if (!form.invoiceFormDetected) {
      await captureDiagnostic(page, 'form-not-detected')
      await saveMenuDiagnostic(tx, page, 'form_not_detected', {
        billing_notice:billingNotice,
        expected_route:'/emissor/emitir',
        actual_route:form.url || page.url(),
      })
    } else {
      const state = await inspectContabilizeiMenu(page)
      await captureDiagnostic(page, 'form-detected')
      await setStatus('preview_ready', { result:{
        phase:'form_discovery',
        billing_notice:billingNotice,
        issuance_enabled:false,
        transaction_id:String(tx.id),
        invoice_form_detected:true,
        detected_fields:safeFieldNames(form),
        menu_candidate_count:state.candidates.length,
        menu_candidates:state.candidates,
        page_title:form.title,
        page_path:form.url,
      }})
      console.log('[nfse.discovery] form_discovery_ready', JSON.stringify({
        account_panel_closed:accountPanel.closed,
        route:'/emissor/emitir',
        field_count:safeFieldNames(form).length
      }))
    }
  }
} catch (error) {
  await captureDiagnostic(page, 'worker-error')
  const code = String(error?.message || 'WORKER_FAILED').replace(/[^A-Z0-9_:-]/gi, '_').slice(0,80)
  try { await setStatus('failed', { errorCode:code }) } catch {}
  console.error('[nfse.discovery]', code)
  process.exitCode = 1
} finally {
  if (browser) await browser.close().catch(() => {})
}

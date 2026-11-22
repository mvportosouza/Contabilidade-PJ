/**
 * Contabilizei draft preview only.
 * All selectors are intentionally conservative. Unknown/ambiguous form controls cause a stop.
 * There is NO submit, emit, issue, save, transmit, or confirm action in this module.
 */
const FIELD_CANDIDATES = {
  customerName: [/nome do tomador/i, /nome do cliente/i, /tomador/i],
  customerTaxId: [/cpf\/cnpj/i, /cpf ou cnpj/i, /documento do tomador/i],
  customerEmail: [/e-mail/i, /email/i],
  customerPhone: [/telefone/i, /celular/i],
  postalCode: [/cep/i],
  address: [/endereço/i, /endereco/i],
  serviceDescription: [/descrição do serviço/i, /descricao do servico/i],
  serviceCode: [/código do serviço/i, /codigo do servico/i],
  cnae: [/cnae/i],
  amount: [/valor do serviço/i, /valor do servico/i],
  competenceDate: [/competência/i, /competencia/i, /data de competência/i],
}
const FORBIDDEN_ACTION = /emitir|transmitir|enviar nota|gerar nota|confirmar emissão|concluir emissão|finalizar emissão/i

async function locateUniqueVisible(page, patterns) {
  const matches = []
  for (const pattern of patterns) {
    const byLabel = page.getByLabel(pattern)
    const labelCount = await byLabel.count().catch(() => 0)
    for (let i = 0; i < labelCount; i += 1) {
      const item = byLabel.nth(i)
      if (await item.isVisible().catch(() => false) && await item.isEditable().catch(() => false)) matches.push(item)
    }
    const byPlaceholder = page.getByPlaceholder(pattern)
    const placeholderCount = await byPlaceholder.count().catch(() => 0)
    for (let i = 0; i < placeholderCount; i += 1) {
      const item = byPlaceholder.nth(i)
      if (await item.isVisible().catch(() => false) && await item.isEditable().catch(() => false)) matches.push(item)
    }
  }
  const unique = []
  for (const item of matches) {
    const same = await Promise.all(unique.map(async other => await item.evaluate((el, candidate) => el === candidate, await other.elementHandle()).catch(() => false)))
    if (!same.some(Boolean)) unique.push(item)
  }
  if (unique.length !== 1) throw new Error(`FORM_FIELD_AMBIGUOUS:${patterns.map(String).join('|')}:${unique.length}`)
  return unique[0]
}

async function fillField(page, key, value) {
  if (value == null || value === '') return { key, filled: false, reason: 'empty_source' }
  const field = await locateUniqueVisible(page, FIELD_CANDIDATES[key])
  await field.fill(String(value))
  return { key, filled: true }
}

export async function fillContabilizeiDraft(page, draft) {
  const state = await inspectContabilizeiForm(page)
  if (!state.invoiceFormDetected) throw new Error('CONTABILIZEI_INVOICE_FORM_NOT_DETECTED')
  const filled = []
  const mapping = [
    ['customerName', draft.customer.name],
    ['customerTaxId', draft.customer.taxId],
    ['customerEmail', draft.customer.email],
    ['customerPhone', draft.customer.phone],
    ['postalCode', draft.customer.postalCode],
    ['address', draft.customer.address],
    ['serviceDescription', draft.service.description],
    ['serviceCode', draft.service.serviceCode],
    ['cnae', draft.service.cnae],
    ['amount', draft.service.amount.toFixed(2)],
    ['competenceDate', draft.service.competenceDate],
  ]
  for (const [key, value] of mapping) filled.push(await fillField(page, key, value))

  // Hard stop: identify any visible enabled action that could send/issue. Do not click it.
  const buttons = await page.locator('button:visible, [role="button"]:visible').evaluateAll(items => items.map(el => ({
    label: (el.innerText || el.getAttribute('aria-label') || '').trim(),
    disabled: Boolean(el.disabled || el.getAttribute('aria-disabled') === 'true'),
  }))).catch(() => [])
  const risky = buttons.filter(button => FORBIDDEN_ACTION.test(button.label))
  return {
    phase: 'draft_filled_not_submitted',
    issuanceEnabled: false,
    filled,
    visibleActionLabels: buttons.map(item => item.label).filter(Boolean),
    riskyActionsDetected: risky.length,
    warning: risky.length ? 'A emissão/transmissão action is visible. Worker must stop and leave it untouched.' : null,
  }
}

export async function inspectContabilizeiForm(page) {
  const title = await page.title().catch(() => '')
  const url = page.url()
  const bodyText = (await page.locator('body').innerText({ timeout: 5000 }).catch(() => '')).slice(0, 3500)
  const inputs = await page.locator('input:visible, textarea:visible, select:visible').evaluateAll(items => items.map(el => ({
    tag: el.tagName.toLowerCase(),
    type: el.getAttribute('type') || '',
    label: el.labels ? [...el.labels].map(label => label.innerText.trim()).join(' ').slice(0,100) : '',
    aria: el.getAttribute('aria-label') || '',
    placeholder: el.getAttribute('placeholder') || '',
    name: el.getAttribute('name') || '',
    disabled: Boolean(el.disabled),
  }))).catch(() => [])
  const buttons = await page.locator('button:visible, [role="button"]:visible').evaluateAll(items => items.map(el => ({
    label: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0,100),
    disabled: Boolean(el.disabled || el.getAttribute('aria-disabled') === 'true'),
  }))).catch(() => [])
  const normalized = bodyText.replace(/\s+/g, ' ')
  const invoiceFormDetected = /nota fiscal|emitir nota|dados do tomador|descrição do serviço|serviço prestado/i.test(normalized)
  return { title, url, invoiceFormDetected, bodyText, inputs, buttons }
}

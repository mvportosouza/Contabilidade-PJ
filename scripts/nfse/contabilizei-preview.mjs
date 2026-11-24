/**
 * Read-only inspection helpers for Contabilizei's NFS-e SPA.
 * Never captures field values or free-form customer content.
 */
const safe = (value, max = 100) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)

export async function inspectContabilizeiMenu(page) {
  const title = safe(await page.title().catch(() => ''), 120)
  const url = (() => { try { const u = new URL(page.url()); return `${u.origin}${u.pathname}${u.hash}`.slice(0, 240) } catch { return '' } })()
  const candidates = await page.locator('a,button,[role],[data-testid],input[type="button"],input[type="submit"]').evaluateAll(nodes => {
    const visible = el => {
      const s = getComputedStyle(el), r = el.getBoundingClientRect()
      return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity || 1) > 0 && r.width > 0 && r.height > 0
    }
    const out = [], seen = new Set()
    for (const el of nodes) {
      if (!visible(el)) continue
      const tag = el.tagName.toLowerCase()
      const role = safe(el.getAttribute('role'), 40)
      const text = safe(el.innerText || el.value || el.textContent, 90)
      const ariaLabel = safe(el.getAttribute('aria-label'), 90)
      const title = safe(el.getAttribute('title'), 90)
      const testId = safe(el.getAttribute('data-testid'), 90)
      const href = el.getAttribute('href') || ''
      let hrefPath = ''
      try { if (href) hrefPath = new URL(href, location.href).pathname + new URL(href, location.href).hash } catch {}
      const interactive = /^(a|button|input)$/.test(tag) || /button|link|menuitem|tab/.test(role) || Boolean(testId)
      if (!interactive) continue
      const key = [tag, role, text, ariaLabel, title, testId, hrefPath].join('|')
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        tag, role, text, ariaLabel, title, hrefPath: safe(hrefPath, 160), testId,
        visible: true,
        disabled: Boolean(el.disabled || el.getAttribute('aria-disabled') === 'true'),
      })
      if (out.length >= 30) break
    }
    return out
  }).catch(() => [])
  return { title, url, candidates }
}

export async function inspectContabilizeiForm(page) {
  const title = safe(await page.title().catch(() => ''), 120)
  const url = (() => { try { const u = new URL(page.url()); return `${u.origin}${u.pathname}${u.hash}`.slice(0, 240) } catch { return '' } })()

  const fields = await page.locator('input:visible,textarea:visible,select:visible,[role="combobox"]:visible,[role="textbox"]:visible').evaluateAll(items => items.map(el => {
    const labelText = el.labels ? [...el.labels].map(label => label.innerText).join(' ') : ''
    const parentLabel = el.closest('label')?.innerText || ''
    return {
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || '',
      type: el.getAttribute('type') || '',
      label: String(labelText || parentLabel).replace(/\s+/g, ' ').trim().slice(0, 90),
      aria: (el.getAttribute('aria-label') || '').slice(0, 90),
      placeholder: (el.getAttribute('placeholder') || '').slice(0, 90),
      name: (el.getAttribute('name') || '').slice(0, 90),
      testId: (el.getAttribute('data-testid') || '').slice(0, 90),
      disabled: Boolean(el.disabled || el.getAttribute('aria-disabled') === 'true'),
    }
  })).catch(() => [])

  const buttons = await page.locator('button:visible,[role="button"]:visible').evaluateAll(items => items.map(el => ({
    label: (el.innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 90),
    testId: (el.getAttribute('data-testid') || '').slice(0, 90),
    disabled: Boolean(el.disabled || el.getAttribute('aria-disabled') === 'true'),
  }))).catch(() => [])

  const headings = await page.locator('h1:visible,h2:visible,h3:visible,label:visible').evaluateAll(items => items
    .map(el => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90))
    .filter(Boolean).slice(0, 45))

  const searchable = [
    ...fields.map(x => `${x.label} ${x.aria} ${x.placeholder} ${x.name} ${x.testId}`),
    ...buttons.map(x => x.label),
    ...headings,
  ].join(' | ')

  const invoiceFormDetected = /atividade da empresa|CNAE/i.test(searchable)
    && /serviço prestado|código nacional/i.test(searchable)
    && /descrição do serviço/i.test(searchable)

  return { title, url, invoiceFormDetected, fields, buttons, headings }
}

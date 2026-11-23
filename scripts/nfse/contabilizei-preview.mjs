/**
 * Contabilizei read-only diagnostics.
 * Captures visible navigation/control metadata only, never field values.
 */
export async function inspectContabilizeiMenu(page) {
  const title = (await page.title().catch(() => '')).slice(0, 120)
  const url = (() => { try { const u = new URL(page.url()); return `${u.origin}${u.pathname}`.slice(0, 240) } catch { return '' } })()
  const controls = await page.locator('a,button,[role],[data-testid],input[type="button"],input[type="submit"]').evaluateAll(nodes => {
    const clean = (v, max = 100) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, max)
    const visible = el => {
      const s = getComputedStyle(el), r = el.getBoundingClientRect()
      return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity || 1) > 0 && r.width > 0 && r.height > 0
    }
    const out = [], seen = new Set()
    for (const el of nodes) {
      if (!visible(el)) continue
      const tag = el.tagName.toLowerCase()
      const role = clean(el.getAttribute('role'), 40)
      const text = clean(el.innerText || el.value || el.textContent, 100)
      const ariaLabel = clean(el.getAttribute('aria-label'), 100)
      const title = clean(el.getAttribute('title'), 100)
      const testId = clean(el.getAttribute('data-testid'), 100)
      const href = el.getAttribute('href') || ''
      let hrefPath = ''
      try { if (href) hrefPath = new URL(href, location.href).pathname.slice(0, 180) } catch {}
      const cls = clean(typeof el.className === 'string' ? el.className : '', 120)
      const interactive = /^(a|button|input)$/.test(tag) || /button|link|menuitem|tab/.test(role) || Boolean(testId)
      if (!interactive) continue
      const key = [tag, role, text, ariaLabel, title, testId, hrefPath].join('|')
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        tag, role, text, ariaLabel, title, hrefPath, testId,
        ariaCurrent: clean(el.getAttribute('aria-current'), 30),
        parentTag: el.parentElement?.tagName?.toLowerCase() || '',
        parentRole: clean(el.parentElement?.getAttribute('role'), 40),
        visible: true,
        disabled: Boolean(el.disabled || el.getAttribute('aria-disabled') === 'true'),
      })
      if (out.length >= 30) break
    }
    return out
  }).catch(() => [])
  const modalVisible = await page.locator('[data-testid="container-modal-certificado-digital"]').isVisible().catch(() => false)
  return { title, url, candidates: controls, certificateModalVisible: modalVisible }
}

export async function inspectContabilizeiForm(page) {
  const title = (await page.title().catch(() => '')).slice(0, 120)
  const url = (() => { try { const u = new URL(page.url()); return `${u.origin}${u.pathname}`.slice(0, 240) } catch { return '' } })()
  const inputs = await page.locator('input:visible, textarea:visible, select:visible').evaluateAll(items => items.map(el => ({
    tag: el.tagName.toLowerCase(),
    type: el.getAttribute('type') || '',
    label: el.labels ? [...el.labels].map(label => label.innerText.trim()).join(' ').slice(0, 80) : '',
    aria: (el.getAttribute('aria-label') || '').slice(0, 80),
    placeholder: (el.getAttribute('placeholder') || '').slice(0, 80),
    name: (el.getAttribute('name') || '').slice(0, 80),
    disabled: Boolean(el.disabled),
  }))).catch(() => [])
  const buttons = await page.locator('button:visible, [role="button"]:visible').evaluateAll(items => items.map(el => ({
    label: (el.innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 80),
    disabled: Boolean(el.disabled || el.getAttribute('aria-disabled') === 'true'),
  }))).catch(() => [])
  const labels = [...inputs.map(x => `${x.tag}:${x.type}:${x.label}:${x.aria}:${x.placeholder}:${x.name}`), ...buttons.map(x => `button:${x.label}`)].filter(Boolean).slice(0, 40)
  const invoiceFormDetected = labels.some(x => /tomador|descrição do serviço|codigo do servico|código do serviço|valor do serviço/i.test(x))
  return { title, url, invoiceFormDetected, inputs, buttons }
}

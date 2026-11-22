/**
 * Contabilizei read-only discovery helpers.
 * Never reads or persists customer form values; never submits or emits an invoice.
 */
const MENU_TERM = /nota\s*fiscal|notas\s*fiscais|fiscal/i

export async function inspectContabilizeiMenu(page) {
  const pageInfo = {
    title: (await page.title().catch(() => '')).slice(0, 120),
    url: (() => { try { const u = new URL(page.url()); return `${u.origin}${u.pathname}`.slice(0, 240) } catch { return '' } })(),
  }
  const candidates = await page.locator('a,button,[role="link"],[role="button"],[role="menuitem"],nav li,[data-testid]').evaluateAll((nodes) => {
    const term = /nota\s*fiscal|notas\s*fiscais|fiscal/i
    const visible = (el) => {
      const style = window.getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      return style && style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0
    }
    const clean = (value, max = 90) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
    const output = []
    const seen = new Set()
    for (const original of nodes) {
      if (!visible(original)) continue
      let target = original
      if (!/^(A|BUTTON)$/i.test(target.tagName) && !target.matches('[role="link"],[role="button"],[role="menuitem"]')) {
        target = original.closest('a,button,[role="link"],[role="button"],[role="menuitem"]') || original
      }
      if (!visible(target)) continue
      const text = clean(target.innerText || target.textContent)
      const aria = clean(target.getAttribute('aria-label'))
      const title = clean(target.getAttribute('title'))
      const testId = clean(target.getAttribute('data-testid'))
      const href = target.getAttribute('href') || ''
      let hrefPath = ''
      try { if (href) hrefPath = new URL(href, location.href).pathname.slice(0, 160) } catch {}
      const searchable = `${text} ${aria} ${title} ${testId} ${hrefPath}`
      if (!term.test(searchable)) continue
      const key = `${target.tagName}|${text}|${aria}|${hrefPath}|${testId}`
      if (seen.has(key)) continue
      seen.add(key)
      output.push({
        tag: target.tagName.toLowerCase(),
        role: clean(target.getAttribute('role'), 40),
        text,
        ariaLabel: aria,
        title,
        hrefPath,
        testId,
        ariaCurrent: clean(target.getAttribute('aria-current'), 30),
        parentTag: target.parentElement?.tagName?.toLowerCase() || '',
        parentRole: clean(target.parentElement?.getAttribute('role'), 40),
        visible: true,
        disabled: Boolean(target.disabled || target.getAttribute('aria-disabled') === 'true'),
      })
      if (output.length >= 30) break
    }
    return output
  }).catch(() => [])
  return { ...pageInfo, candidates }
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

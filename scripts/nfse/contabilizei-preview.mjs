/**
 * Contabilizei read-only discovery helpers.
 * Reads only visible control metadata and never captures customer form values.
 */
const clean = (value, max = 90) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)

export async function inspectContabilizeiMenu(page) {
  const pageInfo = {
    title: (await page.title().catch(() => '')).slice(0, 120),
    url: (() => { try { const u = new URL(page.url()); return `${u.origin}${u.pathname}`.slice(0, 240) } catch { return '' } })(),
  }

  const candidates = await page.locator('a,button,[role="link"],[role="button"],[role="menuitem"],[data-testid]').evaluateAll(nodes => {
    const visible = el => {
      const style = window.getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      return style && style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0
    }
    const cleanText = (value, max = 90) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
    const output = []
    const seen = new Set()
    for (const original of nodes) {
      if (!visible(original)) continue
      let target = original
      if (!/^(A|BUTTON)$/i.test(target.tagName) && !target.matches('[role="link"],[role="button"],[role="menuitem"]')) {
        target = original.closest('a,button,[role="link"],[role="button"],[role="menuitem"]') || original
      }
      if (!visible(target)) continue
      const text = cleanText(target.innerText || target.textContent)
      const aria = cleanText(target.getAttribute('aria-label'))
      const title = cleanText(target.getAttribute('title'))
      const testId = cleanText(target.getAttribute('data-testid'))
      const href = target.getAttribute('href') || ''
      let hrefPath = ''
      try { if (href) hrefPath = new URL(href, location.href).pathname.slice(0, 160) } catch {}
      const searchable = `${text} ${aria} ${title} ${testId} ${hrefPath}`
      if (!/nota|fiscal|menu|navega|fechar|close|depois|agora não|certificado|sidebar|navigation/i.test(searchable)) continue
      const key = `${target.tagName}|${text}|${aria}|${hrefPath}|${testId}`
      if (seen.has(key)) continue
      seen.add(key)
      output.push({
        tag: target.tagName.toLowerCase(),
        role: cleanText(target.getAttribute('role'), 40),
        text,
        ariaLabel: aria,
        title,
        hrefPath,
        testId,
        ariaCurrent: cleanText(target.getAttribute('aria-current'), 30),
        parentTag: target.parentElement?.tagName?.toLowerCase() || '',
        parentRole: cleanText(target.parentElement?.getAttribute('role'), 40),
        visible: true,
        disabled: Boolean(target.disabled || target.getAttribute('aria-disabled') === 'true'),
      })
      if (output.length >= 30) break
    }
    return output
  }).catch(() => [])

  const certificateModal = page.locator('[data-testid="container-modal-certificado-digital"]')
  const modalVisible = await certificateModal.isVisible().catch(() => false)
  const dismiss = []
  if (modalVisible) {
    const controls = certificateModal.locator('button,[role="button"],[aria-label],[title]')
    const count = await controls.count().catch(() => 0)
    for (let i = 0; i < count; i++) {
      const el = controls.nth(i)
      if (!await el.isVisible().catch(() => false)) continue
      const meta = [
        await el.innerText().catch(() => ''),
        await el.getAttribute('aria-label').catch(() => ''),
        await el.getAttribute('title').catch(() => ''),
        await el.getAttribute('data-testid').catch(() => ''),
      ].join(' ').replace(/\s+/g, ' ').trim()
      if (/^(fechar|close|agora não|depois|dispensar|continuar sem certificado|x)$/i.test(meta)) dismiss.push(el)
    }
  }

  return {
    ...pageInfo,
    candidates,
    certificateModalVisible: modalVisible,
    certificateModalDismissCount: dismiss.length,
    dismissCertificateModal: async () => {
      if (dismiss.length !== 1) return false
      await dismiss[0].click({ timeout: 8000 })
      await page.waitForTimeout(500)
      return !(await certificateModal.isVisible().catch(() => false))
    },
  }
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

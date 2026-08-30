import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const serviceWorker = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8')
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, 'public/manifest.json'), 'utf8'),
)

describe('PWA / Lote O', () => {
  it('mantém cache versionado e limpa apenas caches antigos do próprio app', () => {
    expect(serviceWorker).toContain("const CACHE_NAME = 'contabilidade-pj-v12'")
    expect(serviceWorker).toContain("key.startsWith('contabilidade-pj-')")
    expect(serviceWorker).toContain("key !== CACHE_NAME")
  })

  it('cacheia os assets estáticos do build do Next', () => {
    expect(serviceWorker).toContain("url.pathname.startsWith('/_next/static/')")
    expect(serviceWorker).toContain('caches.match(event.request)')
    expect(serviceWorker).toContain('cacheResponse(event.request, response)')
  })

  it('não transforma API em cache persistente do Service Worker', () => {
    expect(serviceWorker).toContain("url.pathname.startsWith('/api/')")
  })

  it('mantém o shell necessário para reabrir o PWA offline', () => {
    for (const asset of [
      '/',
      '/manifest.json',
      '/icon-192.png',
      '/icon-512.png',
      '/assets/logo-horizontal.jpeg',
      '/assets/logo-square.png',
    ]) {
      expect(serviceWorker).toContain(`'${asset}'`)
    }
  })

  it('mantém o manifesto instalável sem alterar a identidade visual', () => {
    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toBe('/')
    expect(manifest.theme_color).toBe('#0F1E35')
    expect(manifest.background_color).toBe('#F2F0ED')
  })
})

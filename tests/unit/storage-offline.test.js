import { beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const RPC_UPDATED_AT = '2026-08-21T12:00:00.000Z'

const { mockSupabase } = vi.hoisted(() => ({
  mockSupabase: {
    auth: {
      getSession: vi.fn(),
    },
    rpc: vi.fn(),
    from: vi.fn(),
  },
}))

vi.mock('../../lib/supabaseClient', () => ({
  supabase: mockSupabase,
}))

class MemoryStorage {
  constructor() {
    this.values = new Map()
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null
  }

  setItem(key, value) {
    this.values.set(String(key), String(value))
  }

  removeItem(key) {
    this.values.delete(String(key))
  }

  clear() {
    this.values.clear()
  }
}

function setupBrowserEnvironment() {
  const localStorage = new MemoryStorage()
  const listeners = new Map()

  globalThis.localStorage = localStorage

  globalThis.window = {
    localStorage,
    addEventListener(type, listener) {
      listeners.set(type, listener)
    },
    removeEventListener(type) {
      listeners.delete(type)
    },
    dispatchEvent() {
      return true
    },
  }

  globalThis.document = {
    visibilityState: 'visible',
    addEventListener() {},
    removeEventListener() {},
  }

  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type
      this.detail = init.detail
    }
  }

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { onLine: false },
  })

  return localStorage
}

describe('persistência offline', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    setupBrowserEnvironment()

    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: USER_ID } } },
      error: null,
    })

    mockSupabase.rpc.mockResolvedValue({
      data: { status: 'saved', updated_at: RPC_UPDATED_AT },
      error: null,
    })
  })

  it('preserva alterações offline após simular fechamento e reabertura', async () => {
    const storage = await import('../../lib/storage')
    const txs = [
      {
        id: 'offline-1',
        tipo: 'receita',
        valor: 1250,
        data: '2026-08-21',
      },
    ]

    await storage.sSet('pj_tx2', txs)

    expect(mockSupabase.rpc).not.toHaveBeenCalled()
    expect(localStorage.getItem(`pj_app_state_sync_queue_v2_${USER_ID}`)).toBeTruthy()

    // Simula encerramento da página: o estado em memória desaparece,
    // mas localStorage permanece disponível na próxima abertura.
    await storage.clearStorageCache({ clearLocal: false })
    vi.resetModules()

    const reopenedStorage = await import('../../lib/storage')
    const restored = await reopenedStorage.sGet('pj_tx2')

    expect(restored).toEqual(txs)
    expect(reopenedStorage.getStorageStatus().state).toBe('offline')
  })

  it('sincroniza a fila quando a conexão volta', async () => {
    const storage = await import('../../lib/storage')
    const txs = [
      {
        id: 'offline-2',
        tipo: 'despesa',
        valor: 300,
        data: '2026-08-21',
      },
    ]

    await storage.sSet('pj_tx2', txs)
    expect(storage.getStorageStatus().state).toBe('offline')

    Object.defineProperty(globalThis.navigator, 'onLine', {
      configurable: true,
      value: true,
    })

    const synced = await storage.syncPendingChanges()

    expect(synced).toBe(true)
    expect(mockSupabase.rpc).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(`pj_app_state_sync_queue_v2_${USER_ID}`)).toBeNull()
    expect(storage.getStorageStatus().state).toBe('synced')
  })
})

describe('restore transacional', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    setupBrowserEnvironment()
    Object.defineProperty(globalThis.navigator, 'onLine', { configurable: true, value: true })
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: USER_ID } } }, error: null,
    })
  })

  it('substitui o estado inteiro em uma única operação quando offline', async () => {
    const storage = await import('../../lib/storage')
    const original = {
      pj_tx2: [{ id: 'old', tipo: 'receita', valor: 10, data: '2026-08-30' }],
      pj_favs2: [], pj_pl: {}, pj_plm: {}, pj_ctb: {}, pj_irrf: {},
    }
    await storage.replaceState(original)

    Object.defineProperty(globalThis.navigator, 'onLine', { configurable: true, value: false })
    const next = {
      pj_tx2: [{ id: 'new', tipo: 'despesa', valor: 20, data: '2026-08-30' }],
      pj_favs2: [{ id: 'fav', tipo: 'despesa', nome: 'Fornecedor' }],
      pj_pl: { '2026-08': 5000 }, pj_plm: {}, pj_ctb: {}, pj_irrf: {},
    }

    await storage.replaceState(next)
    expect(await storage.sGet('pj_tx2')).toEqual(next.pj_tx2)
    expect(await storage.sGet('pj_favs2')).toEqual(next.pj_favs2)
    expect(await storage.sGet('pj_pl')).toEqual(next.pj_pl)
    expect(JSON.parse(localStorage.getItem(`pj_app_state_cache_v3_${USER_ID}`)).state).toEqual(next)
  })

  it('preserva o estado anterior quando a gravação remota falha', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: { status: 'saved', updated_at: RPC_UPDATED_AT }, error: null,
    })
    const storage = await import('../../lib/storage')
    const original = {
      pj_tx2: [{ id: 'old', tipo: 'receita', valor: 10, data: '2026-08-30' }],
      pj_favs2: [], pj_pl: {}, pj_plm: {}, pj_ctb: {}, pj_irrf: {},
    }
    await storage.replaceState(original)

    mockSupabase.rpc.mockRejectedValueOnce(new Error('network'))
    const next = {
      pj_tx2: [{ id: 'new', tipo: 'despesa', valor: 20, data: '2026-08-30' }],
      pj_favs2: [], pj_pl: {}, pj_plm: {}, pj_ctb: {}, pj_irrf: {},
    }

    await expect(storage.replaceState(next)).rejects.toThrow(/restore|aplicar/i)
    expect(await storage.sGet('pj_tx2')).toEqual(original.pj_tx2)
    expect(JSON.parse(localStorage.getItem(`pj_app_state_cache_v3_${USER_ID}`)).state).toEqual(original)
  })
})


describe('restore repetido', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    setupBrowserEnvironment()
    Object.defineProperty(globalThis.navigator, 'onLine', { configurable: true, value: false })
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: USER_ID } } }, error: null,
    })
  })

  it('é idempotente ao restaurar o mesmo estado novamente', async () => {
    const storage = await import('../../lib/storage')
    const state = {
      pj_tx2: [{ id: 'same', tipo: 'receita', valor: 100, data: '2026-08-30' }],
      pj_favs2: [], pj_pl: {}, pj_plm: {}, pj_ctb: {}, pj_irrf: {},
    }
    await storage.replaceState(state)
    await storage.replaceState(state)
    expect(await storage.sGet('pj_tx2')).toEqual(state.pj_tx2)
    expect(JSON.parse(localStorage.getItem(`pj_app_state_cache_v3_${USER_ID}`)).state).toEqual(state)
  })
})

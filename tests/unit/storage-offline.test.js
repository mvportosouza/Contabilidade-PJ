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

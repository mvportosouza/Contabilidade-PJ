import { supabase } from './supabaseClient'

const STORAGE_VERSION = 3
const CLOUD_CACHE_PREFIX = 'pj_app_state_cache_v3_'
const LEGACY_CLOUD_CACHE_PREFIX = 'pj_app_state_cache_v2_'
const SYNC_QUEUE_PREFIX = 'pj_app_state_sync_queue_v2_'
const LEGACY_SYNC_QUEUE_PREFIX = 'pj_app_state_sync_queue_v1_'
const STATUS_EVENT = 'pj-storage-status'

const LEGACY_KEYS = [
  'pj_tx2',
  'pj_favs2',
  'pj_pl',
  'pj_plm',
  'pj_ctb',
  'pj_irrf',
]

const LEGACY_CLOUD_CACHE_KEY = 'pj_app_state_cache_v1'

const emptyState = () => ({
  pj_tx2: [],
  pj_favs2: [],
  pj_pl: {},
  pj_plm: {},
  pj_ctb: {},
  pj_irrf: {},
})

let stateCache = null
let loadedUserId = null
let remoteUpdatedAt = null
let loadPromise = null
let saveChain = Promise.resolve()
let syncInProgress = false
let syncPromise = null
let syncListenersInstalled = false
let conflictSnapshot = null
let currentStatus = {
  state: 'idle',
  online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  dirty: false,
  conflict: false,
  lastSyncedAt: null,
  error: null,
}

function userCacheKey(userId) {
  return `${CLOUD_CACHE_PREFIX}${userId}`
}

function userQueueKey(userId) {
  return `${SYNC_QUEUE_PREFIX}${userId}`
}

function normalizeState(value) {
  return {
    ...emptyState(),
    ...(value && typeof value === 'object' ? value : {}),
  }
}

function nowIso() {
  return new Date().toISOString()
}

function setStatus(patch) {
  currentStatus = {
    ...currentStatus,
    ...patch,
    online: typeof navigator === 'undefined' ? currentStatus.online : navigator.onLine !== false,
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(STATUS_EVENT, { detail: { ...currentStatus } }))
  }
}

function readLocalEnvelope(userId) {
  if (!userId || typeof window === 'undefined') return null

  try {
    let cached = localStorage.getItem(userCacheKey(userId))
    let fromLegacy = false

    if (!cached) {
      cached = localStorage.getItem(`${LEGACY_CLOUD_CACHE_PREFIX}${userId}`)
      fromLegacy = Boolean(cached)
    }

    if (!cached) return null

    const parsed = JSON.parse(cached)

    // Migration from the previous implementation, which stored the raw state.
    if (parsed && parsed.version !== STORAGE_VERSION && parsed.state === undefined) {
      const envelope = {
        version: STORAGE_VERSION,
        state: normalizeState(parsed),
        remoteUpdatedAt: null,
        localUpdatedAt: null,
        dirty: false,
      }
      if (fromLegacy) {
        writeLocalEnvelope(userId, envelope)
        localStorage.removeItem(`${LEGACY_CLOUD_CACHE_PREFIX}${userId}`)
      }
      return envelope
    }

    if (!parsed || typeof parsed !== 'object') return null

    return {
      version: STORAGE_VERSION,
      state: normalizeState(parsed.state),
      remoteUpdatedAt: parsed.remoteUpdatedAt || null,
      localUpdatedAt: parsed.localUpdatedAt || null,
      dirty: Boolean(parsed.dirty),
    }
  } catch (error) {
    console.warn('Não foi possível ler o cache local:', error)
    return null
  }
}

function writeLocalEnvelope(userId, envelope) {
  if (!userId || typeof window === 'undefined') return false

  try {
    localStorage.setItem(
      userCacheKey(userId),
      JSON.stringify({
        version: STORAGE_VERSION,
        state: normalizeState(envelope.state),
        remoteUpdatedAt: envelope.remoteUpdatedAt || null,
        localUpdatedAt: envelope.localUpdatedAt || null,
        dirty: Boolean(envelope.dirty),
      }),
    )
    return true
  } catch (error) {
    console.warn('Não foi possível salvar dados localmente:', error)
    setStatus({ state: 'error', error: 'Não foi possível salvar os dados neste dispositivo.' })
    return false
  }
}

function readSyncQueue(userId) {
  if (!userId || typeof window === 'undefined') return null

  try {
    let queued = localStorage.getItem(userQueueKey(userId))
    let fromLegacy = false

    if (!queued) {
      queued = localStorage.getItem(`${LEGACY_SYNC_QUEUE_PREFIX}${userId}`)
      fromLegacy = Boolean(queued)
    }

    if (!queued) return null

    const parsed = JSON.parse(queued)
    if (!parsed?.state) return null

    const normalized = {
      version: STORAGE_VERSION,
      state: normalizeState(parsed.state),
      baseUpdatedAt: parsed.baseUpdatedAt || null,
      queuedAt: parsed.queuedAt || null,
    }

    if (fromLegacy) {
      writeSyncQueue(userId, normalized.state, normalized.baseUpdatedAt)
      localStorage.removeItem(`${LEGACY_SYNC_QUEUE_PREFIX}${userId}`)
    }

    return normalized
  } catch (error) {
    console.warn('Não foi possível ler a fila de sincronização:', error)
    return null
  }
}

function writeSyncQueue(userId, state, baseUpdatedAt = null) {
  if (!userId || typeof window === 'undefined') return false

  try {
    localStorage.setItem(
      userQueueKey(userId),
      JSON.stringify({
        version: STORAGE_VERSION,
        state: normalizeState(state),
        baseUpdatedAt: baseUpdatedAt || null,
        queuedAt: nowIso(),
      }),
    )
    return true
  } catch (error) {
    console.warn('Não foi possível salvar a fila de sincronização:', error)
    setStatus({ state: 'error', error: 'Não foi possível criar a fila offline.' })
    return false
  }
}

function removeSyncQueue(userId) {
  if (!userId || typeof window === 'undefined') return

  try {
    localStorage.removeItem(userQueueKey(userId))
  } catch (error) {
    console.warn('Não foi possível remover a fila de sincronização:', error)
  }
}

function removeLocalState(userId) {
  if (typeof window === 'undefined') return

  try {
    if (userId) {
      localStorage.removeItem(userCacheKey(userId))
      localStorage.removeItem(userQueueKey(userId))
      localStorage.removeItem(`${LEGACY_CLOUD_CACHE_PREFIX}${userId}`)
      localStorage.removeItem(`${LEGACY_SYNC_QUEUE_PREFIX}${userId}`)
    }

    localStorage.removeItem(LEGACY_CLOUD_CACHE_KEY)

    for (const key of LEGACY_KEYS) {
      localStorage.removeItem(key)
    }
  } catch (error) {
    console.warn('Não foi possível limpar o cache local:', error)
  }
}

async function getSession() {
  try {
    const { data, error } = await supabase.auth.getSession()

    if (error) {
      console.warn('Não foi possível recuperar a sessão:', error)
      return null
    }

    return data?.session || null
  } catch (error) {
    console.warn('Erro inesperado ao recuperar a sessão:', error)
    return null
  }
}

async function currentUser() {
  const session = await getSession()
  return session?.user || null
}

async function saveStateToSupabase(userId, state, baseUpdatedAt = null, { force = false } = {}) {
  if (!userId) return { ok: false, reason: 'no_user' }

  try {
    const { data, error } = await supabase.rpc('save_app_state', {
      p_state: normalizeState(state),
      p_base_updated_at: force ? null : baseUpdatedAt,
      p_force: Boolean(force),
    })

    if (error) throw error

    if (data?.status === 'conflict') {
      return {
        ok: false,
        conflict: true,
        remoteState: normalizeState(data.state),
        remoteUpdatedAt: data.updated_at || null,
      }
    }

    if (data?.status !== 'saved') {
      return { ok: false, reason: 'unexpected_response' }
    }

    return {
      ok: true,
      updatedAt: data.updated_at || nowIso(),
    }
  } catch (error) {
    console.error('Erro ao sincronizar com Supabase:', error)
    return { ok: false, reason: 'network_or_server', error }
  }
}

async function syncQueue(userId = loadedUserId, { force = false } = {}) {
  if (!userId) return false

  // Multiple application paths can request a sync at the same time (AuthGate
  // on session restore + a user save, for example). Never report the second
  // request as finished while the first request is still writing to Supabase.
  // Waiting for the in-flight promise makes sSet() a durable barrier: when it
  // resolves, the queued state has either reached the cloud or a real conflict
  // / network failure has been reported.
  if (syncInProgress) {
    return syncPromise || false
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    setStatus({ state: 'offline', dirty: Boolean(readSyncQueue(userId)) })
    return false
  }

  const queued = readSyncQueue(userId)
  if (!queued?.state) {
    setStatus({ state: 'idle', dirty: false, conflict: false })
    return true
  }

  syncInProgress = true
  syncPromise = (async () => {
    setStatus({ state: 'syncing', dirty: true, error: null })

    try {
      const session = await getSession()

      if (!session?.user || session.user.id !== userId) {
        setStatus({ state: 'error', error: 'Sessão indisponível para sincronização.' })
        return false
      }

      const result = await saveStateToSupabase(
        userId,
        queued.state,
        queued.baseUpdatedAt,
        { force },
      )

      if (result.conflict) {
        conflictSnapshot = { state: result.remoteState, updatedAt: result.remoteUpdatedAt }
        setStatus({
          state: 'conflict',
          dirty: true,
          conflict: true,
          error: 'Existe uma alteração mais recente na nuvem. Os dados deste dispositivo foram preservados.',
        })
        return false
      }

      if (!result.ok) {
        setStatus({ state: 'offline', dirty: true, error: null })
        return false
      }

      const envelope = {
        state: queued.state,
        remoteUpdatedAt: result.updatedAt,
        localUpdatedAt: nowIso(),
        dirty: false,
      }

      stateCache = envelope.state
      remoteUpdatedAt = envelope.remoteUpdatedAt
      loadedUserId = userId
      writeLocalEnvelope(userId, envelope)
      removeSyncQueue(userId)
      conflictSnapshot = null

      setStatus({
        state: 'synced',
        dirty: false,
        conflict: false,
        lastSyncedAt: result.updatedAt,
        error: null,
      })

      return true
    } finally {
      syncInProgress = false
      syncPromise = null
    }
  })()

  return syncPromise
}

function installSyncListeners() {
  if (syncListenersInstalled || typeof window === 'undefined') return

  syncListenersInstalled = true

  const handleOnline = () => {
    setStatus({ state: 'syncing', error: null })
    syncQueue()
  }

  const handleOffline = () => {
    setStatus({ state: 'offline', error: null })
  }

  const handleFocus = () => {
    if (navigator.onLine !== false) syncQueue()
  }

  const handleVisibility = () => {
    if (document.visibilityState === 'visible' && navigator.onLine !== false) {
      syncQueue()
    }
  }

  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
  window.addEventListener('focus', handleFocus)
  document.addEventListener('visibilitychange', handleVisibility)
}

async function loadStateInternal() {
  installSyncListeners()

  const user = await currentUser()
  const userId = user?.id || null

  if (!user) {
    stateCache = emptyState()
    loadedUserId = null
    remoteUpdatedAt = null
    setStatus({ state: 'idle', dirty: false, conflict: false })
    return stateCache
  }

  const localEnvelope = readLocalEnvelope(user.id)
  let queued = readSyncQueue(user.id)

  // If a previous session marked the cache dirty but the queue itself was lost,
  // reconstruct the queue before consulting the cloud so local financial changes
  // are never silently discarded.
  if (!queued && localEnvelope?.dirty) {
    writeSyncQueue(user.id, localEnvelope.state, localEnvelope.remoteUpdatedAt || null)
    queued = readSyncQueue(user.id)
  }

  // If there are unsent local changes, never replace them with a remote snapshot.
  // This is the key safety rule for financial data in offline mode.
  if (queued?.state) {
    stateCache = queued.state
    loadedUserId = user.id
    remoteUpdatedAt = queued.baseUpdatedAt || localEnvelope?.remoteUpdatedAt || null

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setStatus({ state: 'offline', dirty: true, conflict: false })
      return stateCache
    }

    const synced = await syncQueue(user.id)
    if (synced) return stateCache

    // Conflict or temporary outage: preserve local queued state in memory.
    return stateCache
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    stateCache = localEnvelope?.state || emptyState()
    loadedUserId = user.id
    remoteUpdatedAt = localEnvelope?.remoteUpdatedAt || null
    setStatus({ state: 'offline', dirty: Boolean(localEnvelope?.dirty) })
    return stateCache
  }

  try {
    const { data, error } = await supabase
      .from('app_state')
      .select('state, updated_at')
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) throw error

    if (data?.state) {
      stateCache = normalizeState(data.state)
      loadedUserId = user.id
      remoteUpdatedAt = data.updated_at || null

      writeLocalEnvelope(user.id, {
        state: stateCache,
        remoteUpdatedAt,
        localUpdatedAt: nowIso(),
        dirty: false,
      })

      setStatus({
        state: 'synced',
        dirty: false,
        conflict: false,
        lastSyncedAt: data.updated_at || null,
        error: null,
      })

      return stateCache
    }

    // No remote row: restore only this user's local cache, then create the row.
    const local = localEnvelope?.state || emptyState()
    stateCache = local
    loadedUserId = user.id
    remoteUpdatedAt = null

    const result = await saveStateToSupabase(user.id, local, null)

    if (result.ok) {
      remoteUpdatedAt = result.updatedAt
      writeLocalEnvelope(user.id, {
        state: local,
        remoteUpdatedAt,
        localUpdatedAt: nowIso(),
        dirty: false,
      })
      removeSyncQueue(user.id)
      setStatus({ state: 'synced', dirty: false, conflict: false, lastSyncedAt: result.updatedAt, error: null })
    } else if (result.conflict) {
      // Another device created the row between SELECT and INSERT. Keep local data
      // in memory and let the next explicit sync resolve it without overwriting.
      writeSyncQueue(user.id, local, null)
      conflictSnapshot = { state: result.remoteState, updatedAt: result.remoteUpdatedAt }
      setStatus({ state: 'conflict', dirty: true, conflict: true, error: 'Existe uma versão mais recente na nuvem. Os dados locais foram preservados.' })
    } else {
      writeSyncQueue(user.id, local, null)
      setStatus({ state: 'offline', dirty: true, conflict: false, error: null })
    }

    return stateCache
  } catch (error) {
    console.error('Erro ao carregar dados do Supabase:', error)

    const local = localEnvelope?.state
    if (local) {
      stateCache = local
      loadedUserId = user.id
      remoteUpdatedAt = localEnvelope.remoteUpdatedAt || null
      setStatus({ state: 'offline', dirty: Boolean(localEnvelope.dirty), error: null })
      return stateCache
    }

    stateCache = emptyState()
    loadedUserId = user.id
    remoteUpdatedAt = null
    setStatus({ state: 'error', dirty: false, error: 'Não foi possível carregar os dados.' })
    return stateCache
  }
}

async function loadState() {
  if (loadPromise) return loadPromise

  if (stateCache && loadedUserId) {
    return stateCache
  }

  loadPromise = loadStateInternal().finally(() => {
    loadPromise = null
  })

  return loadPromise
}

export async function sGet(key) {
  if (typeof window === 'undefined') return null

  const state = await loadState()
  return state[key] ?? null
}

export async function sSet(key, value) {
  if (typeof window === 'undefined') return

  const operation = saveChain.then(async () => {
    const state = normalizeState(await loadState())
    state[key] = value
    stateCache = state

    const user = await currentUser()
    if (!user) return

    const envelope = readLocalEnvelope(user.id) || {
      state: state,
      remoteUpdatedAt,
      localUpdatedAt: null,
      dirty: false,
    }

    const nextEnvelope = {
      state,
      remoteUpdatedAt: envelope.remoteUpdatedAt || remoteUpdatedAt || null,
      localUpdatedAt: nowIso(),
      dirty: true,
    }

    remoteUpdatedAt = nextEnvelope.remoteUpdatedAt
    writeLocalEnvelope(user.id, nextEnvelope)
    writeSyncQueue(user.id, state, nextEnvelope.remoteUpdatedAt)

    setStatus({ state: 'pending', dirty: true, conflict: false, error: null })

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setStatus({ state: 'offline', dirty: true, conflict: false, error: null })
      return
    }

    await syncQueue(user.id)
  })

  saveChain = operation.catch((error) => {
    console.error('Erro ao salvar alteração:', error)
    setStatus({ state: 'error', dirty: true, error: 'Não foi possível salvar a alteração.' })
  })

  return operation
}

export async function deleteAllAppData() {
  const user = await currentUser()
  if (!user?.id) throw new Error('Sessão indisponível para excluir os dados.')

  // Aguarda qualquer gravação já iniciada para evitar que uma alteração
  // pendente recrie o estado imediatamente após a exclusão.
  try {
    await saveChain
  } catch {
    // A exclusão explícita continua sendo tentada mesmo se um save anterior falhou.
  }

  const { error } = await supabase
    .from('app_state')
    .delete()
    .eq('user_id', user.id)

  if (error) throw error

  await clearStorageCache({ clearLocal: true })
  return true
}

export async function clearStorageCache({ clearLocal = true } = {}) {
  const previousUserId = loadedUserId

  stateCache = null
  loadedUserId = null
  remoteUpdatedAt = null
  conflictSnapshot = null
  loadPromise = null
  syncInProgress = false

  if (clearLocal) {
    removeLocalState(previousUserId)
  }

  setStatus({ state: 'idle', dirty: false, conflict: false, error: null })
}

export async function syncPendingChanges() {
  const user = await currentUser()
  if (!user) return false

  return syncQueue(user.id)
}

export async function forceSyncPendingChanges() {
  const user = await currentUser()
  if (!user) return false

  return syncQueue(user.id, { force: true })
}

export async function resolveStorageConflict(strategy) {
  const user = await currentUser()
  if (!user || !conflictSnapshot) return false

  if (strategy === 'local') {
    return syncQueue(user.id, { force: true })
  }

  if (strategy === 'remote') {
    stateCache = normalizeState(conflictSnapshot.state)
    loadedUserId = user.id
    remoteUpdatedAt = conflictSnapshot.updatedAt || null

    removeSyncQueue(user.id)
    writeLocalEnvelope(user.id, {
      state: stateCache,
      remoteUpdatedAt,
      localUpdatedAt: nowIso(),
      dirty: false,
    })

    conflictSnapshot = null
    setStatus({
      state: 'synced',
      dirty: false,
      conflict: false,
      lastSyncedAt: remoteUpdatedAt,
      error: null,
    })
    return true
  }

  return false
}

export function getStorageStatus() {
  return { ...currentStatus }
}

export function subscribeStorageStatus(listener) {
  if (typeof window === 'undefined' || typeof listener !== 'function') return () => {}

  const handler = (event) => listener(event.detail || getStorageStatus())
  window.addEventListener(STATUS_EVENT, handler)

  // Deliver the current status immediately.
  listener(getStorageStatus())

  return () => window.removeEventListener(STATUS_EVENT, handler)
}

export { loadState }

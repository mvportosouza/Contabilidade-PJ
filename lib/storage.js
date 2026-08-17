import { supabase } from './supabaseClient'

const CLOUD_CACHE_PREFIX =
  'pj_app_state_cache_v2_'

const SYNC_QUEUE_PREFIX =
  'pj_app_state_sync_queue_v1_'

const LEGACY_KEYS = [
  'pj_tx2',
  'pj_favs2',
  'pj_pl',
  'pj_plm',
  'pj_ctb',
  'pj_irrf',
]

const LEGACY_CLOUD_CACHE_KEY =
  'pj_app_state_cache_v1'

let stateCache = null
let loadedUserId = null
let syncInProgress = false
let syncListenersInstalled = false

const emptyState = () => ({
  pj_tx2: [],
  pj_favs2: [],
  pj_pl: {},
  pj_plm: {},
  pj_ctb: {},
  pj_irrf: {},
})

function userCacheKey(userId) {
  return `${CLOUD_CACHE_PREFIX}${userId}`
}

function userQueueKey(userId) {
  return `${SYNC_QUEUE_PREFIX}${userId}`
}

function readLocalState(userId) {
  if (
    !userId ||
    typeof window === 'undefined'
  ) {
    return null
  }

  try {
    const cached =
      localStorage.getItem(
        userCacheKey(userId)
      )

    if (cached) {
      return {
        ...emptyState(),
        ...JSON.parse(cached),
      }
    }
  } catch (error) {
    console.warn(
      'Não foi possível ler o cache local:',
      error
    )
  }

  return null
}

function writeLocalState(
  userId,
  state
) {
  if (
    !userId ||
    typeof window === 'undefined'
  ) {
    return
  }

  try {
    localStorage.setItem(
      userCacheKey(userId),
      JSON.stringify(state)
    )
  } catch (error) {
    console.warn(
      'Não foi possível salvar dados localmente:',
      error
    )
  }
}

function readSyncQueue(userId) {
  if (
    !userId ||
    typeof window === 'undefined'
  ) {
    return null
  }

  try {
    const queued =
      localStorage.getItem(
        userQueueKey(userId)
      )

    if (!queued) {
      return null
    }

    return JSON.parse(queued)
  } catch (error) {
    console.warn(
      'Não foi possível ler a fila de sincronização:',
      error
    )

    return null
  }
}

function writeSyncQueue(
  userId,
  state
) {
  if (
    !userId ||
    typeof window === 'undefined'
  ) {
    return
  }

  try {
    localStorage.setItem(
      userQueueKey(userId),
      JSON.stringify({
        state,
        queuedAt:
          new Date().toISOString(),
      })
    )
  } catch (error) {
    console.warn(
      'Não foi possível salvar a fila de sincronização:',
      error
    )
  }
}

function removeSyncQueue(userId) {
  if (
    !userId ||
    typeof window === 'undefined'
  ) {
    return
  }

  try {
    localStorage.removeItem(
      userQueueKey(userId)
    )
  } catch (error) {
    console.warn(
      'Não foi possível remover a fila de sincronização:',
      error
    )
  }
}

function removeLocalState(userId) {
  if (
    typeof window === 'undefined'
  ) {
    return
  }

  try {
    if (userId) {
      localStorage.removeItem(
        userCacheKey(userId)
      )

      localStorage.removeItem(
        userQueueKey(userId)
      )
    }

    localStorage.removeItem(
      LEGACY_CLOUD_CACHE_KEY
    )

    for (const key of LEGACY_KEYS) {
      localStorage.removeItem(key)
    }
  } catch (error) {
    console.warn(
      'Não foi possível limpar o cache local:',
      error
    )
  }
}

async function currentUser() {
  const {
    data,
    error,
  } = await supabase.auth.getUser()

  if (error) {
    console.warn(
      'Não foi possível identificar o usuário:',
      error
    )

    return null
  }

  return data?.user || null
}

async function saveStateToSupabase(
  userId,
  state
) {
  if (!userId) {
    return false
  }

  try {
    const {
      error,
    } = await supabase
      .from('app_state')
      .upsert(
        {
          user_id: userId,
          state,
          updated_at:
            new Date().toISOString(),
        },
        {
          onConflict: 'user_id',
        }
      )

    if (error) {
      throw error
    }

    return true
  } catch (error) {
    console.error(
      'Erro ao sincronizar com Supabase:',
      error
    )

    return false
  }
}

async function flushSyncQueue(
  userId = loadedUserId
) {
  if (
    !userId ||
    syncInProgress
  ) {
    return false
  }

  if (
    typeof navigator !== 'undefined' &&
    navigator.onLine === false
  ) {
    return false
  }

  const queued =
    readSyncQueue(userId)

  if (!queued?.state) {
    return false
  }

  syncInProgress = true

  try {
    const user =
      await currentUser()

    if (
      !user ||
      user.id !== userId
    ) {
      return false
    }

    const success =
      await saveStateToSupabase(
        userId,
        queued.state
      )

    if (success) {
      removeSyncQueue(userId)

      stateCache = {
        ...emptyState(),
        ...queued.state,
      }

      loadedUserId = userId

      writeLocalState(
        userId,
        stateCache
      )

      return true
    }

    return false
  } finally {
    syncInProgress = false
  }
}

function installSyncListeners() {
  if (
    syncListenersInstalled ||
    typeof window === 'undefined'
  ) {
    return
  }

  syncListenersInstalled = true

  window.addEventListener(
    'online',
    () => {
      flushSyncQueue()
    }
  )

  window.addEventListener(
    'focus',
    () => {
      flushSyncQueue()
    }
  )

  document.addEventListener(
    'visibilitychange',
    () => {
      if (
        document.visibilityState ===
        'visible'
      ) {
        flushSyncQueue()
      }
    }
  )
}

async function loadState() {
  installSyncListeners()

  const user =
    await currentUser()

  const userId =
    user?.id || null

  if (
    stateCache &&
    loadedUserId === userId
  ) {
    await flushSyncQueue(userId)

    return stateCache
  }

  if (user) {
    try {
      const {
        data,
        error,
      } = await supabase
        .from('app_state')
        .select('state')
        .eq('user_id', user.id)
        .maybeSingle()

      if (error) {
        throw error
      }

      if (data?.state) {
        stateCache = {
          ...emptyState(),
          ...data.state,
        }

        loadedUserId =
          user.id

        writeLocalState(
          user.id,
          stateCache
        )

        await flushSyncQueue(
          user.id
        )

        return stateCache
      }

      /*
       * Conta autenticada sem dados
       * no Supabase.
       *
       * Só utilizamos cache pertencente
       * explicitamente a este usuário.
       */
      const local =
        readLocalState(user.id) ||
        emptyState()

      const success =
        await saveStateToSupabase(
          user.id,
          local
        )

      if (!success) {
        writeSyncQueue(
          user.id,
          local
        )
      } else {
        removeSyncQueue(
          user.id
        )
      }

      stateCache = local
      loadedUserId =
        user.id

      writeLocalState(
        user.id,
        stateCache
      )

      return stateCache
    } catch (error) {
      console.error(
        'Erro ao carregar dados do Supabase:',
        error
      )

      /*
       * Offline/indisponibilidade:
       * usar somente o cache deste usuário.
       */
      const local =
        readLocalState(user.id)

      if (local) {
        stateCache = local
        loadedUserId =
          user.id

        return stateCache
      }
    }
  }

  stateCache =
    emptyState()

  loadedUserId =
    userId

  return stateCache
}

export async function sGet(key) {
  if (
    typeof window === 'undefined'
  ) {
    return null
  }

  const state =
    await loadState()

  return state[key] ?? null
}

export async function sSet(
  key,
  value
) {
  if (
    typeof window === 'undefined'
  ) {
    return
  }

  const state =
    await loadState()

  state[key] = value

  stateCache = state

  const user =
    await currentUser()

  if (!user) {
    return
  }

  /*
   * Primeiro salva localmente.
   * Isso mantém a interface rápida
   * mesmo sem internet.
   */
  writeLocalState(
    user.id,
    state
  )

  /*
   * Se estiver offline, coloca o estado
   * mais recente na fila.
   */
  if (
    typeof navigator !== 'undefined' &&
    navigator.onLine === false
  ) {
    writeSyncQueue(
      user.id,
      state
    )

    return
  }

  const success =
    await saveStateToSupabase(
      user.id,
      state
    )

  if (success) {
    removeSyncQueue(
      user.id
    )
  } else {
    /*
     * Guarda sempre a versão mais recente.
     * Assim, várias alterações offline
     * não criam uma fila enorme de snapshots.
     */
    writeSyncQueue(
      user.id,
      state
    )
  }
}

export async function clearStorageCache({
  clearLocal = true,
} = {}) {
  const previousUserId =
    loadedUserId

  stateCache = null
  loadedUserId = null
  syncInProgress = false

  if (clearLocal) {
    removeLocalState(
      previousUserId
    )
  }
}

export async function syncPendingChanges() {
  const user =
    await currentUser()

  if (!user) {
    return false
  }

  return flushSyncQueue(
    user.id
  )
}

export { loadState }
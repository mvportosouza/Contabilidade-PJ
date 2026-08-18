import { supabase } from './supabaseClient'

const CLOUD_CACHE_PREFIX = 'pj_app_state_cache_v2_'
const LEGACY_KEYS = ['pj_tx2', 'pj_favs2', 'pj_pl', 'pj_plm', 'pj_ctb', 'pj_irrf']
const LEGACY_CLOUD_CACHE_KEY = 'pj_app_state_cache_v1'

let stateCache = null
let loadedUserId = null
const writeQueues = new Map()
const pendingSyncUsers = new Set()

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

function readLocalState(userId) {
  if (!userId || typeof window === 'undefined') return null

  try {
    const cached = localStorage.getItem(userCacheKey(userId))
    if (cached) return { ...emptyState(), ...JSON.parse(cached) }
  } catch {}

  return null
}

function writeLocalState(userId, state) {
  if (!userId || typeof window === 'undefined') return

  try {
    localStorage.setItem(userCacheKey(userId), JSON.stringify(state))
  } catch (error) {
    console.warn('Não foi possível salvar dados localmente:', error)
  }
}

function removeLocalState(userId) {
  if (typeof window === 'undefined') return

  try {
    if (userId) localStorage.removeItem(userCacheKey(userId))
    localStorage.removeItem(LEGACY_CLOUD_CACHE_KEY)
    for (const key of LEGACY_KEYS) localStorage.removeItem(key)
  } catch (error) {
    console.warn('Não foi possível limpar o cache local:', error)
  }
}

async function currentUser() {
  const { data } = await supabase.auth.getUser()
  return data?.user || null
}

async function loadState() {
  const user = await currentUser()
  const userId = user?.id || null

  if (stateCache && loadedUserId === userId) return stateCache

  if (user) {
    try {
      const { data, error } = await supabase
        .from('app_state')
        .select('state')
        .eq('user_id', user.id)
        .maybeSingle()

      if (error) throw error

      if (data?.state) {
        stateCache = { ...emptyState(), ...data.state }
        loadedUserId = user.id
        writeLocalState(user.id, stateCache)
        return stateCache
      }

      // Conta sem dados no Supabase começa limpa para evitar que
      // dados locais de outro usuário sejam herdados.
      const local = readLocalState(user.id) || emptyState()
      const { error: insertError } = await supabase
        .from('app_state')
        .upsert({
          user_id: user.id,
          state: local,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })

      if (insertError) throw insertError

      stateCache = local
      loadedUserId = user.id
      writeLocalState(user.id, stateCache)
      return stateCache
    } catch (error) {
      console.error('Erro ao carregar dados do Supabase:', error)

      // Offline/indisponibilidade: usar somente o cache pertencente
      // explicitamente ao usuário autenticado.
      const local = readLocalState(user.id)
      if (local) {
        stateCache = local
        loadedUserId = user.id
        return stateCache
      }
    }
  }

  stateCache = emptyState()
  loadedUserId = userId
  return stateCache
}

export async function sGet(key) {
  if (typeof window === 'undefined') return null
  const state = await loadState()
  return state[key] ?? null
}

export async function sSet(key, value) {
  if (typeof window === 'undefined') return

  const user = await currentUser()
  if (!user) return

  const userId = user.id
  const previous = writeQueues.get(userId) || Promise.resolve()

  const operation = previous.then(async () => {
    const state = { ...(await loadState()) }
    state[key] = value
    stateCache = state
    loadedUserId = userId
    writeLocalState(userId, state)

    const { error } = await supabase
      .from('app_state')
      .upsert({
        user_id: userId,
        state,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

    if (error) {
      pendingSyncUsers.add(userId)
      console.error('Erro ao sincronizar com Supabase:', error)
      throw error
    }

    pendingSyncUsers.delete(userId)

    return state
  })

  writeQueues.set(userId, operation.catch(() => undefined))

  try {
    return await operation
  } catch (error) {
    // O cache local já foi atualizado; o próximo save/online event poderá
    // tentar sincronizar novamente sem perder a alteração feita pelo usuário.
    console.error('Falha ao persistir alteração:', error)
    return stateCache
  }
}
export async function syncPendingChanges() {
  const user = await currentUser()
  if (!user || !pendingSyncUsers.has(user.id)) return true

  const previous = writeQueues.get(user.id) || Promise.resolve()
  const operation = previous.then(async () => {
    const state = await loadState()
    const { error } = await supabase
      .from('app_state')
      .upsert({
        user_id: user.id,
        state,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

    if (error) throw error
    pendingSyncUsers.delete(user.id)
    writeLocalState(user.id, state)
    return true
  })

  writeQueues.set(user.id, operation.catch(() => undefined))

  try {
    return await operation
  } catch (error) {
    console.error('Não foi possível sincronizar os dados pendentes:', error)
    return false
  }
}

export async function clearStorageCache({ clearLocal = true } = {}) {
  const previousUserId = loadedUserId
  if (previousUserId) {
    writeQueues.delete(previousUserId)
    pendingSyncUsers.delete(previousUserId)
  }
  stateCache = null
  loadedUserId = null

  if (clearLocal) removeLocalState(previousUserId)
}

export { loadState }

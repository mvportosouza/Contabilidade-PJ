import { supabase } from './supabaseClient'

const CLOUD_CACHE_KEY = 'pj_app_state_cache_v1'
const LEGACY_KEYS = ['pj_tx2', 'pj_favs2', 'pj_pl', 'pj_plm', 'pj_ctb', 'pj_irrf']

let stateCache = null
let loadedUserId = null

const emptyState = () => ({
  pj_tx2: [],
  pj_favs2: [],
  pj_pl: {},
  pj_plm: {},
  pj_ctb: {},
  pj_irrf: {},
})

function readLocalState() {
  try {
    const cached = localStorage.getItem(CLOUD_CACHE_KEY)
    if (cached) return { ...emptyState(), ...JSON.parse(cached) }
  } catch {}

  const state = emptyState()
  let found = false
  for (const key of LEGACY_KEYS) {
    try {
      const raw = localStorage.getItem(key)
      if (raw !== null) {
        state[key] = JSON.parse(raw)
        found = true
      }
    } catch {}
  }

  return found ? state : null
}

function writeLocalState(state) {
  try {
    localStorage.setItem(CLOUD_CACHE_KEY, JSON.stringify(state))
    for (const key of LEGACY_KEYS) {
      if (state[key] !== undefined) {
        localStorage.setItem(key, JSON.stringify(state[key]))
      }
    }
  } catch (error) {
    console.warn('Não foi possível salvar dados localmente:', error)
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
        writeLocalState(stateCache)
        return stateCache
      }

      // First login: migrate the data already present in this browser.
      const local = readLocalState() || emptyState()
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
      writeLocalState(stateCache)
      return stateCache
    } catch (error) {
      console.error('Erro ao carregar dados do Supabase:', error)
    }
  }

  stateCache = readLocalState() || emptyState()
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

  const state = await loadState()
  state[key] = value
  stateCache = state
  writeLocalState(state)

  const user = await currentUser()
  if (!user) return

  try {
    const { error } = await supabase
      .from('app_state')
      .upsert({
        user_id: user.id,
        state,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

    if (error) throw error
  } catch (error) {
    console.error('Erro ao sincronizar com Supabase:', error)
  }
}

export async function clearStorageCache() {
  stateCache = null
  loadedUserId = null
}

export { loadState }

import { supabase } from './supabaseClient'

const CLOUD_CACHE_PREFIX = 'pj_app_state_cache_v2_'
const LEGACY_KEYS = ['pj_tx2', 'pj_favs2', 'pj_pl', 'pj_plm', 'pj_ctb', 'pj_irrf']
const LEGACY_CLOUD_CACHE_KEY = 'pj_app_state_cache_v1'

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

function userCacheKey(userId) {
  return `${CLOUD_CACHE_PREFIX}${userId}`
}

function readLocalState(userId) {
  if (!userId || typeof window === 'undefined') return null

  try {
    const cached = localStorage.getItem(userCacheKey(userId))

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

function writeLocalState(userId, state) {
  if (!userId || typeof window === 'undefined') return

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

function removeLocalState(userId) {
  if (typeof window === 'undefined') return

  try {
    if (userId) {
      localStorage.removeItem(
        userCacheKey(userId)
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
  const { data, error } =
    await supabase.auth.getUser()

  if (error) {
    console.warn(
      'Não foi possível identificar o usuário:',
      error
    )
    return null
  }

  return data?.user || null
}

async function loadState() {
  const user = await currentUser()
  const userId = user?.id || null

  if (
    stateCache &&
    loadedUserId === userId
  ) {
    return stateCache
  }

  if (user) {
    try {
      const { data, error } =
        await supabase
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

        loadedUserId = user.id

        writeLocalState(
          user.id,
          stateCache
        )

        return stateCache
      }

      /*
       * Conta autenticada sem dados no Supabase.
       *
       * Importante:
       * NÃO herdamos o antigo cache global.
       * Só usamos um cache que pertença
       * explicitamente a este user_id.
       */
      const local =
        readLocalState(user.id) ||
        emptyState()

      const {
        error: insertError,
      } = await supabase
        .from('app_state')
        .upsert(
          {
            user_id: user.id,
            state: local,
            updated_at:
              new Date().toISOString(),
          },
          {
            onConflict: 'user_id',
          }
        )

      if (insertError) {
        throw insertError
      }

      stateCache = local
      loadedUserId = user.id

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
       * Se estiver offline ou o Supabase
       * estiver temporariamente indisponível,
       * usamos somente o cache pertencente
       * ao usuário atualmente autenticado.
       */
      const local =
        readLocalState(user.id)

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
  if (typeof window === 'undefined') {
    return null
  }

  const state = await loadState()

  return state[key] ?? null
}

export async function sSet(key, value) {
  if (typeof window === 'undefined') {
    return
  }

  const state = await loadState()

  state[key] = value
  stateCache = state

  const user = await currentUser()

  if (!user) {
    return
  }

  /*
   * Salva primeiro no cache local do usuário
   * para manter a experiência rápida/offline.
   */
  writeLocalState(
    user.id,
    state
  )

  try {
    const { error } =
      await supabase
        .from('app_state')
        .upsert(
          {
            user_id: user.id,
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
  } catch (error) {
    /*
     * O dado permanece no cache local
     * e poderá ser sincronizado em uma
     * operação posterior.
     */
    console.error(
      'Erro ao sincronizar com Supabase:',
      error
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

  if (clearLocal) {
    removeLocalState(
      previousUserId
    )
  }
}

export { loadState }

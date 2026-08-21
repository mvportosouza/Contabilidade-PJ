import { supabase } from './supabaseClient'

export const MIN_PASSWORD_LENGTH = 8

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

export function validateEmail(email) {
  const normalized = normalizeEmail(email)

  if (!normalized) {
    throw new Error('Informe seu e-mail.')
  }

  if (!normalized.includes('@')) {
    throw new Error('Informe um e-mail válido.')
  }

  return normalized
}

export function validatePassword(password, message = 'A senha precisa ter pelo menos 8 caracteres.') {
  const value = String(password || '')

  if (value.length < MIN_PASSWORD_LENGTH) {
    throw new Error(message)
  }

  return value
}

export function getAuthRedirectUrl() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/`
  }

  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL

  if (configuredUrl) {
    return configuredUrl.endsWith('/')
      ? configuredUrl
      : `${configuredUrl}/`
  }

  return 'https://contabilidade-pj.vercel.app/'
}

export function isRecoveryUrl(locationLike = typeof window !== 'undefined' ? window.location : null) {
  if (!locationLike) return false

  const hash = locationLike.hash || ''
  const search = locationLike.search || ''

  return hash.includes('type=recovery') || search.includes('type=recovery')
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession()

  if (error) throw error

  return data?.session || null
}

export function subscribeAuth(listener) {
  const { data } = supabase.auth.onAuthStateChange(listener)

  return () => {
    data?.subscription?.unsubscribe()
  }
}

export async function signIn(email, password) {
  const normalizedEmail = validateEmail(email)
  const validPassword = validatePassword(password)

  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password: validPassword,
  })

  if (error) throw error

  return data
}

export async function signUp(email, password) {
  const normalizedEmail = validateEmail(email)
  const validPassword = validatePassword(password)

  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password: validPassword,
    options: {
      emailRedirectTo: getAuthRedirectUrl(),
    },
  })

  if (error) throw error

  return data
}

export async function requestPasswordReset(email) {
  const normalizedEmail = validateEmail(email)

  const { error } = await supabase.auth.resetPasswordForEmail(
    normalizedEmail,
    { redirectTo: getAuthRedirectUrl() },
  )

  if (error) throw error
}

export async function updatePassword(password) {
  const validPassword = validatePassword(
    password,
    'A nova senha precisa ter pelo menos 8 caracteres.',
  )

  const { data, error } = await supabase.auth.updateUser({
    password: validPassword,
  })

  if (error) throw error

  return data?.user || null
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()

  if (error) throw error
}

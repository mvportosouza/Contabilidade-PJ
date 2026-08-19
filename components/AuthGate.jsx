import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import {
  clearStorageCache,
  getStorageStatus,
  resolveStorageConflict,
  subscribeStorageStatus,
  syncPendingChanges,
} from '../lib/storage'

export default function AuthGate({ children }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState(null)
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [storageStatus, setStorageStatus] = useState(getStorageStatus())
  const [storageBusy, setStorageBusy] = useState(false)

  useEffect(() => {
    let mounted = true

    const initializeAuth = async () => {
      try {
        const {
          data,
          error: sessionError,
        } = await supabase.auth.getSession()

        if (!mounted) return

        if (sessionError) {
          console.error(
            'Erro ao recuperar sessão:',
            sessionError
          )

          setSession(null)
        } else {
          setSession(
            data?.session || null
          )
        }
      } catch (err) {
        console.error(
          'Erro inesperado ao inicializar autenticação:',
          err
        )

        if (mounted) {
          setSession(null)
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    initializeAuth()

    const {
      data: listener,
    } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (!mounted) return

        setSession(
          nextSession || null
        )

        setLoading(false)

        if (
          event === 'SIGNED_OUT'
        ) {
          setMessage('')
          setError('')
        }
      }
    )

    return () => {
      mounted = false
      listener?.subscription?.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session) return undefined

    const unsubscribe = subscribeStorageStatus(setStorageStatus)
    syncPendingChanges().catch(() => {})

    return unsubscribe
  }, [session])

  const handleConflictResolution = async (strategy) => {
    if (storageBusy) return

    setStorageBusy(true)
    try {
      const resolved = await resolveStorageConflict(strategy)
      if (resolved && strategy === 'remote' && typeof window !== 'undefined') {
        window.location.reload()
      }
    } finally {
      setStorageBusy(false)
    }
  }

  const storageMessage = () => {
    switch (storageStatus.state) {
      case 'offline':
        return 'Modo offline: alterações ficam salvas neste dispositivo e serão sincronizadas quando a conexão voltar.'
      case 'syncing':
        return 'Sincronizando seus dados com segurança…'
      case 'pending':
        return 'Alteração salva neste dispositivo. Sincronizando…'
      case 'conflict':
        return 'Há uma versão mais recente na nuvem. Seus dados locais foram preservados.'
      case 'error':
        return storageStatus.error || 'Não foi possível sincronizar. Seus dados locais foram preservados.'
      default:
        return ''
    }
  }

  const storageVisible = Boolean(
    session && ['offline', 'syncing', 'pending', 'conflict', 'error'].includes(storageStatus.state),
  )

  const getAuthRedirectUrl = () => {
    if (
      typeof window !== 'undefined' &&
      window.location.origin
    ) {
      return `${window.location.origin}/`
    }

    const configuredUrl =
      process.env.NEXT_PUBLIC_SITE_URL

    if (configuredUrl) {
      return configuredUrl.endsWith('/')
        ? configuredUrl
        : `${configuredUrl}/`
    }

    return 'https://contabilidade-pj.vercel.app/'
  }

  const submit = async (event) => {
    event.preventDefault()

    if (busy) return

    setBusy(true)
    setError('')
    setMessage('')

    try {
      const normalizedEmail =
        email.trim().toLowerCase()

      if (!normalizedEmail) {
        throw new Error(
          'Informe seu e-mail.'
        )
      }

      if (
        !normalizedEmail.includes('@')
      ) {
        throw new Error(
          'Informe um e-mail válido.'
        )
      }

      if (password.length < 6) {
        throw new Error(
          'A senha precisa ter pelo menos 6 caracteres.'
        )
      }

      if (mode === 'login') {
        const {
          error: signInError,
        } = await supabase.auth.signInWithPassword(
          {
            email: normalizedEmail,
            password,
          }
        )

        if (signInError) {
          throw signInError
        }

        setPassword('')
        return
      }

      const {
        data,
        error: signUpError,
      } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo:
            getAuthRedirectUrl(),
        },
      })

      if (signUpError) {
        throw signUpError
      }

      if (!data?.session) {
        setMessage(
          'Cadastro realizado. Verifique seu e-mail para confirmar a conta e depois faça o login.'
        )

        setMode('login')
        setPassword('')
      } else {
        setMessage(
          'Cadastro realizado com sucesso.'
        )

        setPassword('')
      }
    } catch (err) {
      console.error(
        'Erro de autenticação:',
        err
      )

      const message =
        err?.message ||
        'Não foi possível concluir a operação.'

      setError(message)
    } finally {
      setBusy(false)
    }
  }

  const signOut = async () => {
    if (busy) return

    setBusy(true)
    setError('')

    try {
      await supabase.auth.signOut()
    } catch (error) {
      console.error(
        'Erro ao sair da conta:',
        error
      )
    } finally {
      await clearStorageCache()

      setSession(null)
      setPassword('')
      setMessage('')
      setError('')
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={styles.spinner}>
            ⏳
          </div>

          <h1 style={styles.title}>
            Finanças PJ
          </h1>

          <p style={styles.muted}>
            Verificando sua sessão…
          </p>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div style={styles.page}>
        <form
          onSubmit={submit}
          style={styles.card}
        >
          <div style={styles.logo}>
            <img
              src="/assets/logo-square.png"
              alt="Marcus Vinícius Porto Souza"
              width={58}
              height={58}
              style={styles.logoImage}
            />
          </div>

          <h1 style={styles.title}>
            Finanças PJ
          </h1>

          <p style={styles.subtitle}>
            Acesse sua gestão financeira com sincronização segura.
          </p>

          <div style={styles.tabs}>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setMode('login')
                setError('')
                setMessage('')
              }}
              style={
                mode === 'login'
                  ? styles.tabActive
                  : styles.tab
              }
            >
              Entrar
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setMode('signup')
                setError('')
                setMessage('')
              }}
              style={
                mode === 'signup'
                  ? styles.tabActive
                  : styles.tab
              }
            >
              Criar conta
            </button>
          </div>

          <label style={styles.label}>
            E-mail
          </label>

          <input
            value={email}
            onChange={(e) =>
              setEmail(e.target.value)
            }
            type="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="seu@email.com"
            style={styles.input}
            disabled={busy}
          />

          <label style={styles.label}>
            Senha
          </label>

          <input
            value={password}
            onChange={(e) =>
              setPassword(e.target.value)
            }
            type="password"
            autoComplete={
              mode === 'login'
                ? 'current-password'
                : 'new-password'
            }
            placeholder="Mínimo de 6 caracteres"
            style={styles.input}
            disabled={busy}
          />

          {error ? (
            <div style={styles.error}>
              {error}
            </div>
          ) : null}

          {message ? (
            <div style={styles.success}>
              {message}
            </div>
          ) : null}

          <button
            disabled={busy}
            type="submit"
            style={
              busy
                ? styles.primaryDisabled
                : styles.primary
            }
          >
            {busy
              ? 'Aguarde…'
              : mode === 'login'
                ? 'Entrar'
                : 'Criar conta'}
          </button>

          <p style={styles.note}>
            Seus dados financeiros serão vinculados à sua conta e protegidos por RLS no Supabase.
          </p>
        </form>
      </div>
    )
  }

  return (
    <>
      {children}

      <button
        onClick={signOut}
        disabled={busy}
        style={styles.signOut}
        title="Sair da conta"
      >
        {busy ? '…' : 'Sair'}
      </button>

      {storageVisible ? (
        <div
          role={storageStatus.state === 'conflict' || storageStatus.state === 'error' ? 'alert' : 'status'}
          aria-live="polite"
          style={styles.storageBanner}
        >
          <div style={styles.storageMessage}>
            <span style={styles.storageDot}>
              {storageStatus.state === 'syncing' || storageStatus.state === 'pending'
                ? '↻'
                : storageStatus.state === 'conflict' || storageStatus.state === 'error'
                  ? '!'
                  : '•'}
            </span>
            <span>{storageMessage()}</span>
          </div>

          {storageStatus.state === 'conflict' ? (
            <div style={styles.storageActions}>
              <button
                type="button"
                disabled={storageBusy}
                onClick={() => handleConflictResolution('remote')}
                style={styles.storageSecondary}
              >
                Usar versão da nuvem
              </button>
              <button
                type="button"
                disabled={storageBusy}
                onClick={() => handleConflictResolution('local')}
                style={styles.storagePrimary}
              >
                Manter dados deste dispositivo
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  )
}

const styles = {
  storageBanner: {
    position: 'fixed',
    left: 12,
    right: 12,
    bottom: 88,
    zIndex: 9999,
    background: '#0F1E35',
    color: '#fff',
    borderRadius: 14,
    padding: '10px 12px',
    boxShadow: '0 12px 32px rgba(0,0,0,.22)',
    fontFamily: 'Georgia,serif',
  },

  storageMessage: {
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    fontSize: 12,
    lineHeight: 1.35,
  },

  storageDot: {
    width: 24,
    height: 24,
    borderRadius: 999,
    display: 'grid',
    placeItems: 'center',
    background: 'rgba(200,169,110,.18)',
    color: '#C8A96E',
    fontWeight: 800,
    flexShrink: 0,
  },

  storageActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 9,
    flexWrap: 'wrap',
  },

  storagePrimary: {
    border: 0,
    borderRadius: 9,
    padding: '7px 10px',
    background: '#C8A96E',
    color: '#0F1E35',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },

  storageSecondary: {
    border: '1px solid rgba(255,255,255,.35)',
    borderRadius: 9,
    padding: '7px 10px',
    background: 'transparent',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  page: {
    minHeight: '100vh',
    background: '#F2F0ED',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    boxSizing: 'border-box',
    fontFamily: 'Arial, sans-serif',
  },

  card: {
    width: '100%',
    maxWidth: 430,
    background: '#fff',
    borderRadius: 22,
    padding: 28,
    boxSizing: 'border-box',
    boxShadow:
      '0 15px 45px rgba(0,0,0,.10)',
  },

  logo: {
    width: 58,
    height: 58,
    borderRadius: 16,
    background: '#0F1E35',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 800,
    fontSize: 22,
    marginBottom: 18,
  },

  logoImage: {
    width: 58,
    height: 58,
    borderRadius: 16,
    objectFit: 'cover',
    display: 'block',
  },

  spinner: {
    fontSize: 24,
  },

  title: {
    margin: '0 0 8px',
    color: '#0F1E35',
    fontSize: 27,
  },

  subtitle: {
    margin: '0 0 22px',
    color: '#6B655E',
    lineHeight: 1.5,
  },

  muted: {
    color: '#6B655E',
  },

  tabs: {
    display: 'flex',
    gap: 8,
    marginBottom: 20,
  },

  tab: {
    flex: 1,
    border: '1px solid #E0D8CE',
    background: '#fff',
    borderRadius: 10,
    padding: 10,
    color: '#777',
    cursor: 'pointer',
  },

  tabActive: {
    flex: 1,
    border: '1px solid #0F1E35',
    background: '#0F1E35',
    borderRadius: 10,
    padding: 10,
    color: '#fff',
    cursor: 'pointer',
  },

  label: {
    display: 'block',
    margin: '12px 0 6px',
    color: '#4D473F',
    fontWeight: 700,
    fontSize: 13,
  },

  input: {
    width: '100%',
    boxSizing: 'border-box',
    border: '1px solid #D9D2C8',
    borderRadius: 11,
    padding: '12px 13px',
    fontSize: 15,
    outline: 'none',
  },

  primary: {
    width: '100%',
    border: 0,
    borderRadius: 12,
    padding: 13,
    marginTop: 18,
    background: '#0F1E35',
    color: '#fff',
    fontWeight: 800,
    fontSize: 15,
    cursor: 'pointer',
  },

  primaryDisabled: {
    width: '100%',
    border: 0,
    borderRadius: 12,
    padding: 13,
    marginTop: 18,
    background: '#7A8494',
    color: '#fff',
    fontWeight: 800,
    fontSize: 15,
    cursor: 'not-allowed',
  },

  error: {
    marginTop: 14,
    padding: 11,
    borderRadius: 10,
    background: '#FCEAEA',
    color: '#9B2525',
    fontSize: 13,
    lineHeight: 1.4,
  },

  success: {
    marginTop: 14,
    padding: 11,
    borderRadius: 10,
    background: '#EAF7EE',
    color: '#236B3A',
    fontSize: 13,
    lineHeight: 1.4,
  },

  note: {
    margin: '16px 0 0',
    color: '#8A837A',
    fontSize: 11,
    lineHeight: 1.5,
  },

  signOut: {
    position: 'fixed',
    top: 12,
    right: 12,
    zIndex: 9999,
    border: '1px solid #D9D2C8',
    background: '#fff',
    color: '#555',
    borderRadius: 10,
    padding: '7px 11px',
    cursor: 'pointer',
    boxShadow:
      '0 3px 12px rgba(0,0,0,.08)',
  },
}
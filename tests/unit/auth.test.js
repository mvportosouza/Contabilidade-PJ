import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSupabase } = vi.hoisted(() => ({
  mockSupabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      updateUser: vi.fn(),
      signOut: vi.fn(),
    },
    functions: {
      invoke: vi.fn(),
    },
  },
}))

vi.mock('../../lib/supabaseClient', () => ({
  supabase: mockSupabase,
}))

describe('Auth QA — Lote Q', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    })

    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
      error: null,
    })

    mockSupabase.auth.signUp.mockResolvedValue({
      data: { session: null, user: { id: 'user-1' } },
      error: null,
    })

    mockSupabase.auth.resetPasswordForEmail.mockResolvedValue({
      error: null,
    })

    mockSupabase.auth.updateUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    })

    mockSupabase.auth.signOut.mockResolvedValue({
      error: null,
    })

    mockSupabase.functions.invoke.mockResolvedValue({
      data: { ok: true },
      error: null,
    })

    mockSupabase.auth.onAuthStateChange.mockReturnValue({
      data: {
        subscription: {
          unsubscribe: vi.fn(),
        },
      },
    })
  })

  it('faz login com e-mail normalizado e senha válida', async () => {
    const auth = await import('../../lib/auth')

    const result = await auth.signIn(
      ' USER@Example.COM ',
      '12345678',
    )

    expect(result.session.user.id).toBe('user-1')
    expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: '12345678',
    })
  })

  it('faz signup com confirmação por e-mail quando não há sessão imediata', async () => {
    const auth = await import('../../lib/auth')

    const result = await auth.signUp(
      ' USER@Example.COM ',
      '12345678',
    )

    expect(result.session).toBeNull()
    expect(mockSupabase.auth.signUp).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: '12345678',
      options: {
        emailRedirectTo: expect.stringContaining('/'),
      },
    })
  })

  it('recupera a sessão atual', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: {
        session: { user: { id: 'user-1' } },
      },
      error: null,
    })

    const auth = await import('../../lib/auth')

    const session = await auth.getSession()

    expect(session.user.id).toBe('user-1')
    expect(mockSupabase.auth.getSession).toHaveBeenCalledTimes(1)
  })

  it('assina e permite cancelar o listener de sessão', async () => {
    const auth = await import('../../lib/auth')
    const callback = vi.fn()

    const unsubscribe = auth.subscribeAuth(callback)

    expect(mockSupabase.auth.onAuthStateChange).toHaveBeenCalledWith(callback)

    unsubscribe()

    expect(
      mockSupabase.auth.onAuthStateChange.mock.results[0].value.data.subscription.unsubscribe,
    ).toHaveBeenCalledTimes(1)
  })

  it('propaga o evento PASSWORD_RECOVERY para a camada de autenticação', async () => {
    const auth = await import('../../lib/auth')
    const callback = vi.fn()

    auth.subscribeAuth(callback)

    const registeredCallback =
      mockSupabase.auth.onAuthStateChange.mock.calls[0][0]

    registeredCallback('PASSWORD_RECOVERY', {
      user: { id: 'user-1' },
    })

    expect(callback).toHaveBeenCalledWith(
      'PASSWORD_RECOVERY',
      { user: { id: 'user-1' } },
    )
  })

  it('solicita recuperação de senha com redirect de autenticação', async () => {
    const auth = await import('../../lib/auth')

    await auth.requestPasswordReset(' USER@Example.COM ')

    expect(mockSupabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      'user@example.com',
      { redirectTo: expect.stringContaining('/') },
    )
  })

  it('atualiza a senha e retorna o usuário atualizado', async () => {
    const auth = await import('../../lib/auth')

    const user = await auth.updatePassword('87654321')

    expect(user.id).toBe('user-1')
    expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith({
      password: '87654321',
    })
  })

  it('executa logout', async () => {
    const auth = await import('../../lib/auth')

    await auth.signOut()

    expect(mockSupabase.auth.signOut).toHaveBeenCalledTimes(1)
  })

  it('exclui a conta exclusivamente pela Edge Function autenticada', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: {
        session: { user: { id: 'user-1' } },
      },
      error: null,
    })

    const auth = await import('../../lib/auth')

    await auth.deleteAccount()

    expect(mockSupabase.functions.invoke).toHaveBeenCalledWith('delete-account')
    expect(mockSupabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('não tenta excluir a conta sem uma sessão autenticada', async () => {
    const auth = await import('../../lib/auth')

    await expect(auth.deleteAccount()).rejects.toThrow(
      'Sessão indisponível para excluir a conta.',
    )

    expect(mockSupabase.functions.invoke).not.toHaveBeenCalled()
  })

  it('rejeita senha com menos de 8 caracteres antes de chamar o Supabase', async () => {
    const auth = await import('../../lib/auth')

    await expect(
      auth.signIn('user@example.com', '1234567'),
    ).rejects.toThrow('A senha precisa ter pelo menos 8 caracteres.')

    expect(mockSupabase.auth.signInWithPassword).not.toHaveBeenCalled()
  })
})

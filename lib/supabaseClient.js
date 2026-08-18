import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

export const supabaseConfigured = Boolean(
  supabaseUrl && supabasePublishableKey,
)

if (!supabaseConfigured) {
  console.error(
    'Configuração do Supabase ausente: NEXT_PUBLIC_SUPABASE_URL e/ou NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.',
  )
}

// Valores neutros apenas para permitir que o bundle carregue sem configuração.
// O aplicativo nunca deve depender destes valores para acessar dados reais.
const clientUrl = supabaseUrl || 'https://placeholder.supabase.co'
const clientKey = supabasePublishableKey || 'sb_publishable_placeholder'

export const supabase = createClient(clientUrl, clientKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
})

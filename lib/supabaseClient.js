import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL

const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

/*
 * Não interromper o carregamento do aplicativo
 * caso as variáveis ainda não estejam disponíveis.
 *
 * O erro será tratado de forma segura pelo cliente,
 * evitando uma tela branca durante a inicialização.
 */

const missingConfig = []

if (!supabaseUrl) {
  missingConfig.push(
    'NEXT_PUBLIC_SUPABASE_URL'
  )
}

if (!supabasePublishableKey) {
  missingConfig.push(
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
  )
}

if (missingConfig.length > 0) {
  console.error(
    'Configuração do Supabase ausente:',
    missingConfig.join(', ')
  )
}

/*
 * Mantemos os valores conhecidos apenas como
 * fallback de inicialização.
 *
 * Quando as variáveis do Vercel estiverem configuradas,
 * elas sempre terão prioridade.
 */

const clientUrl =
  supabaseUrl ||
  'https://qthvrxnldlttvyspnesc.supabase.co'

const clientKey =
  supabasePublishableKey ||
  'sb_publishable_15po_tMxkkxb3p5N0ym3iw_lGfB2aD9'

export const supabase = createClient(
  clientUrl,
  clientKey,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  }
)
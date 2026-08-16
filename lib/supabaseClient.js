import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabasePublishableKey) {
  console.warn('Variáveis do Supabase não configuradas. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY no ambiente do projeto.')
}

export const supabase = createClient(
  supabaseUrl || 'https://qthvrxnldlttvyspnesc.supabase.co',
  supabasePublishableKey || 'sb_publishable_15po_tMxkkxb3p5N0ym3iw_lGfB2aD9',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  }
)

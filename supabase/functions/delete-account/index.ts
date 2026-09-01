import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4'

const PRODUCTION_ORIGIN = 'https://contabilidade-pj.vercel.app'
const configuredOrigin = Deno.env.get('SITE_URL') || Deno.env.get('NEXT_PUBLIC_SITE_URL')
const allowedOrigin = configuredOrigin?.replace(/\/$/, '') || PRODUCTION_ORIGIN

const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
}

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT_MAX = 5
const MAX_BODY_BYTES = 1024

// Best-effort per-instance limiter. It intentionally does not persist identifiers
// or payloads. The Auth token is never logged or included in an error response.
const attempts = new Map<string, { count: number; resetAt: number }>()

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}

function clientKey(req: Request) {
  const forwarded = req.headers.get('x-forwarded-for')
  const firstIp = forwarded?.split(',')[0]?.trim()
  return firstIp || 'anonymous'
}

function isRateLimited(key: string) {
  const now = Date.now()
  const current = attempts.get(key)

  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return false
  }

  if (current.count >= RATE_LIMIT_MAX) {
    return true
  }

  current.count += 1
  return false
}

function cleanupRateLimitMap() {
  const now = Date.now()
  for (const [key, value] of attempts) {
    if (value.resetAt <= now) attempts.delete(key)
  }
}

setInterval(cleanupRateLimitMap, RATE_LIMIT_WINDOW_MS)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405)
  }

  const requestOrigin = req.headers.get('Origin')
  if (requestOrigin && requestOrigin.replace(/\/$/, '') !== allowedOrigin) {
    return jsonResponse({ error: 'origin_not_allowed' }, 403)
  }

  const contentLength = Number(req.headers.get('content-length') || 0)
  if (contentLength > MAX_BODY_BYTES) {
    return jsonResponse({ error: 'payload_too_large' }, 413)
  }

  if (isRateLimited(clientKey(req))) {
    return jsonResponse({ error: 'rate_limited' }, 429)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'missing_authorization' }, 401)
  }

  const token = authHeader.slice('Bearer '.length).trim()
  if (!token || token.length > 8192) {
    return jsonResponse({ error: 'missing_authorization' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'server_not_configured' }, 500)
  }

  const userClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser(token)

  if (userError || !user) {
    return jsonResponse({ error: 'invalid_session' }, 401)
  }

  // Destructive operation: target is always derived from the authenticated token.
  const { error: deleteError } = await userClient.auth.admin.deleteUser(user.id)

  if (deleteError) {
    return jsonResponse({ error: 'account_deletion_failed' }, 500)
  }

  return jsonResponse({ ok: true }, 200)
})

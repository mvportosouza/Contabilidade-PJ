import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export function getAdminClient() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('NFSE_SERVER_NOT_CONFIGURED')
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function getAuthenticatedUser(req) {
  if (!supabaseUrl || !publishableKey) throw new Error('SUPABASE_AUTH_NOT_CONFIGURED')
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return null
  const client = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await client.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

export function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8')
  const right = Buffer.from(String(b || ''), 'utf8')
  if (!left.length || left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export function requireWorker(req) {
  const expected = process.env.NFSE_WORKER_BRIDGE_TOKEN
  const supplied = req.headers['x-nfse-worker-token']
  if (!expected || !safeEqual(supplied, expected)) return false
  return true
}

export function publicRun(run) {
  if (!run) return null
  return {
    id: run.id,
    month: run.month,
    year: run.year,
    status: run.status,
    requested_count: run.requested_count,
    result: run.result || null,
    error_code: run.error_code || null,
    created_at: run.created_at,
    updated_at: run.updated_at,
  }
}


function getOtpKey() {
  const value = process.env.NFSE_OTP_ENCRYPTION_KEY || ''
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error('NFSE_OTP_KEY_NOT_CONFIGURED')
  return Buffer.from(value, 'hex')
}

export function encryptOtp(code) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getOtpKey(), iv)
  const encrypted = Buffer.concat([cipher.update(String(code), 'utf8'), cipher.final()])
  return `v1:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted.toString('hex')}`
}

export function decryptOtp(value) {
  const [version, ivHex, tagHex, dataHex] = String(value || '').split(':')
  if (version !== 'v1' || !ivHex || !tagHex || !dataHex) throw new Error('INVALID_OTP_CIPHERTEXT')
  const decipher = createDecipheriv('aes-256-gcm', getOtpKey(), Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8')
}

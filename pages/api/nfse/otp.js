import { getAdminClient, getAuthenticatedUser, encryptOtp } from '../../../lib/nfseServer'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' })
  }
  try {
    const user = await getAuthenticatedUser(req)
    if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' })
    const runId = String(req.body?.runId || '')
    const code = String(req.body?.code || '').replace(/\s/g, '')
    if (!/^[0-9a-f-]{36}$/i.test(runId) || !/^\d{6}$/.test(code)) return res.status(400).json({ error: 'INVALID_OTP' })

    const admin = getAdminClient()
    const { data: run, error: readError } = await admin.from('nfse_automation_runs')
      .select('id,status,otp_expires_at').eq('id', runId).eq('user_id', user.id).maybeSingle()
    if (readError) throw readError
    if (!run || run.status !== 'awaiting_otp') return res.status(409).json({ error: 'RUN_NOT_WAITING_FOR_OTP' })
    const expires = new Date(Date.now() + 3 * 60 * 1000).toISOString()
    const { error: updateError } = await admin.from('nfse_automation_runs')
      .update({ otp_code: encryptOtp(code), otp_expires_at: expires, otp_submitted_at: new Date().toISOString() })
      .eq('id', runId).eq('user_id', user.id).eq('status', 'awaiting_otp')
    if (updateError) throw updateError
    return res.status(202).json({ ok: true })
  } catch (error) {
    console.error('[nfse.otp]', error?.message || 'unknown')
    return res.status(500).json({ error: 'OTP_SUBMISSION_FAILED' })
  }
}

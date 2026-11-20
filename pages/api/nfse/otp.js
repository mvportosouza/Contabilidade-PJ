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
    if (!/^[0-9a-f-]{36}$/i.test(runId) || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'INVALID_OTP' })
    }

    const admin = getAdminClient()
    const encryptedCode = encryptOtp(code)
    const now = new Date().toISOString()
    const expires = new Date(Date.now() + 3 * 60 * 1000).toISOString()
    const { data, error } = await admin.from('nfse_automation_runs')
      .update({
        otp_code: encryptedCode,
        otp_expires_at: expires,
        otp_submitted_at: now,
        otp_consumed_at: null,
        updated_at: now,
      })
      .eq('id', runId)
      .eq('user_id', user.id)
      .eq('status', 'awaiting_otp')
      .or(`otp_expires_at.is.null,otp_expires_at.gt.${now}`)
      .select('id')
      .maybeSingle()

    if (error) throw error
    if (!data) return res.status(409).json({ error: 'RUN_NOT_WAITING_FOR_OTP' })
    return res.status(202).json({ ok: true })
  } catch (error) {
    console.error('[nfse.otp]', error?.message || 'unknown')
    return res.status(500).json({ error: 'OTP_SUBMISSION_FAILED' })
  }
}

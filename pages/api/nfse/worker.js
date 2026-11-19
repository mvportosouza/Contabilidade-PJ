import { getAdminClient, requireWorker, decryptOtp } from '../../../lib/nfseServer'

export default async function handler(req, res) {
  if (!requireWorker(req)) return res.status(401).json({ error: 'WORKER_UNAUTHORIZED' })
  const admin = getAdminClient()
  try {
    if (req.method === 'GET') {
      const runId = String(req.query.runId || '')
      const action = String(req.query.action || 'claim')
      if (!/^[0-9a-f-]{36}$/i.test(runId)) return res.status(400).json({ error: 'INVALID_RUN_ID' })
      const { data: run, error } = await admin.from('nfse_automation_runs').select('*').eq('id', runId).maybeSingle()
      if (error) throw error
      if (!run) return res.status(404).json({ error: 'RUN_NOT_FOUND' })

      if (action === 'claim') {
        if (run.status !== 'queued') return res.status(409).json({ error: 'RUN_NOT_QUEUED' })
        const { error: updateError } = await admin.from('nfse_automation_runs').update({ status: 'authenticating' }).eq('id', runId).eq('status', 'queued')
        if (updateError) throw updateError
        const email = process.env.CONTABILIZEI_EMAIL
        const password = process.env.CONTABILIZEI_PASSWORD
        if (!email || !password) return res.status(503).json({ error: 'CONTABILIZEI_CREDENTIALS_NOT_CONFIGURED' })
        return res.status(200).json({ runId, payload: run.payload, credentials: { email, password } })
      }

      if (action === 'otp') {
        if (run.status !== 'awaiting_otp') return res.status(200).json({ code: null })
        if (!run.otp_code || !run.otp_expires_at || new Date(run.otp_expires_at).getTime() < Date.now()) {
          if (run.otp_code) await admin.from('nfse_automation_runs').update({ otp_code: null, otp_expires_at: null }).eq('id', runId)
          return res.status(200).json({ code: null })
        }
        const code = decryptOtp(run.otp_code)
        await admin.from('nfse_automation_runs').update({ otp_code: null, otp_expires_at: null, otp_consumed_at: new Date().toISOString() }).eq('id', runId).eq('otp_code', code)
        return res.status(200).json({ code })
      }
      return res.status(400).json({ error: 'INVALID_ACTION' })
    }

    if (req.method === 'POST') {
      const runId = String(req.body?.runId || '')
      const status = String(req.body?.status || '')
      const allowed = new Set(['awaiting_otp', 'validating_access', 'completed', 'failed'])
      if (!/^[0-9a-f-]{36}$/i.test(runId) || !allowed.has(status)) return res.status(400).json({ error: 'INVALID_UPDATE' })
      const patch = { status, updated_at: new Date().toISOString() }
      if (status === 'failed') patch.error_code = String(req.body?.errorCode || 'WORKER_FAILED').slice(0, 80)
      if (status === 'completed') patch.result = { phase: 'access_validation', authenticated: true, issuance_enabled: false }
      const { error } = await admin.from('nfse_automation_runs').update(patch).eq('id', runId)
      if (error) throw error
      return res.status(200).json({ ok: true })
    }
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' })
  } catch (error) {
    console.error('[nfse.worker]', error?.message || 'unknown')
    return res.status(500).json({ error: 'WORKER_OPERATION_FAILED' })
  }
}

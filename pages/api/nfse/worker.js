import { getAdminClient, requireWorker, decryptOtp } from '../../../lib/nfseServer'

const RUN_ID = /^[0-9a-f-]{36}$/i
const WORKER_STATUSES = ['awaiting_otp', 'validating_access', 'completed', 'failed']

export default async function handler(req, res) {
  if (!requireWorker(req)) return res.status(401).json({ error: 'WORKER_UNAUTHORIZED' })
  const admin = getAdminClient()
  try {
    if (req.method === 'GET') {
      const runId = String(req.query.runId || '')
      const action = String(req.query.action || 'claim')
      if (!RUN_ID.test(runId)) return res.status(400).json({ error: 'INVALID_RUN_ID' })

      if (action === 'claim') {
        const { data: claimed, error: claimError } = await admin.from('nfse_automation_runs')
          .update({ status: 'authenticating', updated_at: new Date().toISOString() })
          .eq('id', runId)
          .eq('status', 'queued')
          .select('id,user_id,payload')
          .maybeSingle()
        if (claimError) throw claimError
        if (!claimed) return res.status(409).json({ error: 'RUN_NOT_QUEUED' })

        const email = process.env.CONTABILIZEI_EMAIL
        const password = process.env.CONTABILIZEI_PASSWORD
        if (!email || !password) {
          await admin.from('nfse_automation_runs')
            .update({ status: 'failed', error_code: 'CONTABILIZEI_CREDENTIALS_NOT_CONFIGURED', updated_at: new Date().toISOString() })
            .eq('id', runId).eq('status', 'authenticating')
          return res.status(503).json({ error: 'CONTABILIZEI_CREDENTIALS_NOT_CONFIGURED' })
        }
        return res.status(200).json({ runId, payload: claimed.payload, credentials: { email, password } })
      }

      if (action === 'otp') {
        const { data: run, error: readError } = await admin.from('nfse_automation_runs')
          .select('status').eq('id', runId).maybeSingle()
        if (readError) throw readError
        if (!run || run.status !== 'awaiting_otp') return res.status(200).json({ code: null })

        const { data: consumed, error: consumeError } = await admin.rpc('consume_nfse_otp', { p_run_id: runId })
        if (consumeError) throw consumeError
        const encrypted = Array.isArray(consumed) ? consumed[0]?.otp_code : consumed?.otp_code
        if (!encrypted) return res.status(200).json({ code: null })
        return res.status(200).json({ code: decryptOtp(encrypted) })
      }

      return res.status(400).json({ error: 'INVALID_ACTION' })
    }

    if (req.method === 'POST') {
      const runId = String(req.body?.runId || '')
      const status = String(req.body?.status || '')
      if (!RUN_ID.test(runId) || !WORKER_STATUSES.includes(status)) {
        return res.status(400).json({ error: 'INVALID_UPDATE' })
      }

      const transitions = {
        authenticating: ['awaiting_otp', 'failed'],
        awaiting_otp: ['validating_access', 'failed'],
        validating_access: ['awaiting_otp', 'completed', 'failed'],
      }
      const patch = { status, updated_at: new Date().toISOString() }
      if (status === 'failed') patch.error_code = String(req.body?.errorCode || 'WORKER_FAILED').replace(/[^A-Z0-9_:-]/gi, '_').slice(0, 80)
      if (status === 'completed') patch.result = { phase: 'access_validation', authenticated: true, issuance_enabled: false }

      const { data: currentRun, error: readError } = await admin.from('nfse_automation_runs')
        .select('status').eq('id', runId).maybeSingle()
      if (readError) throw readError
      if (!currentRun || !transitions[currentRun.status]?.includes(status)) {
        return res.status(409).json({ error: 'INVALID_STATUS_TRANSITION' })
      }
      const { data, error } = await admin.from('nfse_automation_runs')
        .update(patch).eq('id', runId).eq('status', currentRun.status).select('id').maybeSingle()
      if (error) throw error
      if (!data) return res.status(409).json({ error: 'RUN_STATE_CHANGED' })
      return res.status(200).json({ ok: true })
    }

    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' })
  } catch (error) {
    console.error('[nfse.worker]', error?.message || 'unknown')
    return res.status(500).json({ error: 'WORKER_OPERATION_FAILED' })
  }
}

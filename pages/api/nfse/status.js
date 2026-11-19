import { getAdminClient, getAuthenticatedUser, publicRun } from '../../../lib/nfseServer'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' })
  }
  try {
    const user = await getAuthenticatedUser(req)
    if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' })
    const runId = String(req.query.runId || '')
    if (!/^[0-9a-f-]{36}$/i.test(runId)) return res.status(400).json({ error: 'INVALID_RUN_ID' })
    const admin = getAdminClient()
    const { data, error } = await admin.from('nfse_automation_runs').select('*').eq('id', runId).eq('user_id', user.id).maybeSingle()
    if (error) throw error
    if (!data) return res.status(404).json({ error: 'RUN_NOT_FOUND' })
    return res.status(200).json({ run: publicRun(data) })
  } catch (error) {
    console.error('[nfse.status]', error?.message || 'unknown')
    return res.status(500).json({ error: 'NFSE_STATUS_FAILED' })
  }
}

import { getAdminClient, getAuthenticatedUser, publicRun } from '../../../lib/nfseServer'

const ACTIVE = ['queued', 'authenticating', 'awaiting_otp', 'validating_access']

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' })
  }

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' })

    const month = Number(req.body?.month)
    const year = Number(req.body?.year)
    if (!Number.isInteger(month) || month < 0 || month > 11 || !Number.isInteger(year) || year < 2020 || year > 2100) {
      return res.status(400).json({ error: 'INVALID_COMPETENCE' })
    }

    const admin = getAdminClient()
    const { data: activeRuns, error: activeError } = await admin
      .from('nfse_automation_runs')
      .select('id,status')
      .eq('user_id', user.id)
      .in('status', ACTIVE)
      .limit(1)
    if (activeError) throw activeError
    if (activeRuns?.length) return res.status(409).json({ error: 'RUN_ALREADY_ACTIVE', run_id: activeRuns[0].id })

    const { data: appState, error: stateError } = await admin
      .from('app_state')
      .select('state')
      .eq('user_id', user.id)
      .maybeSingle()
    if (stateError) throw stateError

    const txs = Array.isArray(appState?.state?.pj_tx2) ? appState.state.pj_tx2 : []
    const competence = `${year}-${String(month + 1).padStart(2, '0')}`
    const pending = txs
      .filter((tx) => tx?.tipo === 'receita' && tx?.recebido !== false && tx?.notaGerada !== true && typeof tx?.data === 'string' && tx.data.slice(0, 7) === competence)
      .sort((a, b) => String(a.data).localeCompare(String(b.data)))

    if (!pending.length) return res.status(422).json({ error: 'NO_PENDING_INVOICES' })

    // Primeira fase: autenticação assistida e validação de acesso, sem emitir nota.
    // O fluxo real de emissão será habilitado somente após validar os campos e a revisão fiscal.
    const selected = pending.slice(0, 1)
    const { data: run, error: insertError } = await admin
      .from('nfse_automation_runs')
      .insert({
        user_id: user.id,
        month,
        year,
        status: 'queued',
        requested_count: selected.length,
        transaction_ids: selected.map((tx) => String(tx.id)),
        payload: selected.map((tx) => ({ id: String(tx.id) })),
        result: { phase: 'access_validation', issuance_enabled: false },
      })
      .select('*')
      .single()
    if (insertError) throw insertError

    const token = process.env.GITHUB_ACTIONS_TOKEN
    const repo = process.env.GITHUB_ACTIONS_REPOSITORY || 'mvportosouza/Contabilidade-PJ'
    const workflow = process.env.NFSE_WORKFLOW_FILE || 'nfse-assistida.yml'
    if (!token) {
      await admin.from('nfse_automation_runs').update({ status: 'failed', error_code: 'GITHUB_DISPATCH_NOT_CONFIGURED' }).eq('id', run.id)
      return res.status(503).json({ error: 'AUTOMATION_NOT_CONFIGURED' })
    }

    const dispatch = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main', inputs: { run_id: run.id } }),
    })

    if (!dispatch.ok) {
      await admin.from('nfse_automation_runs').update({ status: 'failed', error_code: `GITHUB_DISPATCH_${dispatch.status}` }).eq('id', run.id)
      return res.status(502).json({ error: 'WORKFLOW_DISPATCH_FAILED' })
    }

    return res.status(202).json({ run: publicRun(run), phase: 'access_validation' })
  } catch (error) {
    console.error('[nfse.start]', error?.message || 'unknown')
    return res.status(500).json({ error: 'NFSE_START_FAILED' })
  }
}

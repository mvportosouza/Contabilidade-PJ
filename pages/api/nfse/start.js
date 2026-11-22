import { getAdminClient, getAuthenticatedUser, publicRun } from '../../../lib/nfseServer'

const ACTIVE = ['queued', 'authenticating', 'awaiting_otp', 'validating_access', 'preparing_draft']
const eligible = (tx, competence) => tx?.tipo === 'receita' && tx?.recebido !== false && tx?.notaGerada !== true && typeof tx?.data === 'string' && tx.data.slice(0, 7) === competence

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' }) }
  try {
    const user = await getAuthenticatedUser(req)
    if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' })
    const month = Number(req.body?.month)
    const year = Number(req.body?.year)
    if (!Number.isInteger(month) || month < 0 || month > 11 || !Number.isInteger(year) || year < 2020 || year > 2100) return res.status(400).json({ error: 'INVALID_COMPETENCE' })

    const admin = getAdminClient()
    const { data: activeRuns, error: activeError } = await admin.from('nfse_automation_runs').select('id,status').eq('user_id', user.id).in('status', ACTIVE).limit(1)
    if (activeError) throw activeError
    if (activeRuns?.length) return res.status(409).json({ error: 'RUN_ALREADY_ACTIVE', run_id: activeRuns[0].id })

    const { data: appState, error: stateError } = await admin.from('app_state').select('state').eq('user_id', user.id).maybeSingle()
    if (stateError) throw stateError
    const txs = Array.isArray(appState?.state?.pj_tx2) ? appState.state.pj_tx2 : []
    const competence = `${year}-${String(month + 1).padStart(2, '0')}`
    const selected = txs.filter(tx => eligible(tx, competence)).sort((a,b) => String(a.data).localeCompare(String(b.data))).slice(0, 1)
    if (!selected.length) return res.status(422).json({ error: 'NO_PENDING_INVOICES' })

    const { data: run, error: insertError } = await admin.from('nfse_automation_runs').insert({
      user_id: user.id, month, year, status: 'queued', requested_count: 1,
      transaction_ids: [String(selected[0].id)],
      // Only this single selected transaction is sent to the private worker bridge.
      // A strict whitelist is used to avoid unrelated app_state properties.
      payload: [{
        id: String(selected[0].id), tipo: selected[0].tipo, recebido: selected[0].recebido,
        notaGerada: selected[0].notaGerada, data: selected[0].data, valor: selected[0].valor,
        nome: selected[0].nome, cnpj: selected[0].cnpj, email: selected[0].email,
        telefone: selected[0].telefone, cep: selected[0].cep, endereco: selected[0].endereco, municipioPrestacao: selected[0].municipioPrestacao || 'Aracaju/SE',
        descricaoServico: selected[0].descricaoServico, descricao: selected[0].descricao,
        codigoServico: selected[0].codigoServico, cnae: selected[0].cnae,
        nbs: selected[0].nbs, taxaISS: selected[0].taxaISS, issMunicipal: selected[0].issMunicipal,
        descontoAtivo: selected[0].descontoAtivo, descontoTipo: selected[0].descontoTipo,
        descontoValor: selected[0].descontoValor,
      }],
      result: { phase: 'draft_preview', issuance_enabled: false },
    }).select('*').single()
    if (insertError) throw insertError

    const token = process.env.GITHUB_ACTIONS_TOKEN
    const repo = process.env.GITHUB_ACTIONS_REPOSITORY || 'mvportosouza/Contabilidade-PJ'
    const workflow = process.env.NFSE_WORKFLOW_FILE || 'nfse-assistida.yml'
    const baseUrl = process.env.NFSE_API_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || ''
    if (!token || !baseUrl) {
      await admin.from('nfse_automation_runs').update({ status:'failed', error_code:'GITHUB_DISPATCH_NOT_CONFIGURED' }).eq('id',run.id)
      return res.status(503).json({ error:'AUTOMATION_NOT_CONFIGURED' })
    }
    let parsed
    try { parsed = new URL(baseUrl) } catch { parsed = null }
    if (!parsed || parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      await admin.from('nfse_automation_runs').update({ status:'failed', error_code:'NFSE_API_BASE_URL_INVALID' }).eq('id',run.id)
      return res.status(500).json({ error:'AUTOMATION_CONFIGURATION_INVALID' })
    }
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) || !/^[A-Za-z0-9_.-]+$/.test(workflow)) {
      await admin.from('nfse_automation_runs').update({ status:'failed', error_code:'GITHUB_DISPATCH_CONFIG_INVALID' }).eq('id',run.id)
      return res.status(500).json({ error:'AUTOMATION_CONFIGURATION_INVALID' })
    }
    const dispatch = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`, {
      method:'POST', headers:{ Authorization:`Bearer ${token}`, Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28', 'Content-Type':'application/json' },
      body:JSON.stringify({ ref:'main', inputs:{ run_id:run.id } }),
    })
    if (!dispatch.ok) {
      await admin.from('nfse_automation_runs').update({ status:'failed', error_code:`GITHUB_DISPATCH_${dispatch.status}` }).eq('id',run.id)
      return res.status(502).json({ error:'WORKFLOW_DISPATCH_FAILED' })
    }
    return res.status(202).json({ run:publicRun(run), phase:'draft_preview', issuance_enabled:false })
  } catch (error) {
    console.error('[nfse.start]', error?.message || 'unknown')
    return res.status(500).json({ error:'NFSE_START_FAILED' })
  }
}

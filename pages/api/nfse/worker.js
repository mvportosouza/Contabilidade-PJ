import { getAdminClient, requireWorker, decryptOtp } from '../../../lib/nfseServer'

const RUN_ID = /^[0-9a-f-]{36}$/i
const WORKER_STATUSES = ['awaiting_otp','validating_access','preparing_draft','preview_ready','completed','failed']
const TRANSITIONS = {
  authenticating:['awaiting_otp','failed'],
  awaiting_otp:['validating_access','failed'],
  validating_access:['preparing_draft','failed'],
  preparing_draft:['preview_ready','failed'],
}

export default async function handler(req,res) {
  if (!requireWorker(req)) return res.status(401).json({ error:'WORKER_UNAUTHORIZED' })
  const admin = getAdminClient()
  try {
    if (req.method === 'GET') {
      const runId = String(req.query.runId || '')
      const action = String(req.query.action || 'claim')
      if (!RUN_ID.test(runId)) return res.status(400).json({ error:'INVALID_RUN_ID' })
      if (action === 'claim') {
        const { data: claimed,error } = await admin.from('nfse_automation_runs').update({status:'authenticating',updated_at:new Date().toISOString()}).eq('id',runId).eq('status','queued').select('id,user_id,payload').maybeSingle()
        if (error) throw error
        if (!claimed) return res.status(409).json({error:'RUN_NOT_QUEUED'})
        const email=process.env.CONTABILIZEI_EMAIL, password=process.env.CONTABILIZEI_PASSWORD
        if (!email || !password) {
          await admin.from('nfse_automation_runs').update({status:'failed',error_code:'CONTABILIZEI_CREDENTIALS_NOT_CONFIGURED',updated_at:new Date().toISOString()}).eq('id',runId).eq('status','authenticating')
          return res.status(503).json({error:'CONTABILIZEI_CREDENTIALS_NOT_CONFIGURED'})
        }
        if (!Array.isArray(claimed.payload) || claimed.payload.length !== 1) return res.status(422).json({error:'INVALID_DRAFT_PAYLOAD'})
        return res.status(200).json({runId,payload:claimed.payload,credentials:{email,password}})
      }
      if (action === 'otp') {
        const {data:run,error:readError}=await admin.from('nfse_automation_runs').select('status').eq('id',runId).maybeSingle()
        if(readError) throw readError
        if(!run || run.status!=='awaiting_otp') return res.status(200).json({code:null})
        const {data:consumed,error:consumeError}=await admin.rpc('consume_nfse_otp',{p_run_id:runId})
        if(consumeError) throw consumeError
        const encrypted=Array.isArray(consumed)?consumed[0]?.otp_code:consumed?.otp_code
        return res.status(200).json({code:encrypted?decryptOtp(encrypted):null})
      }
      return res.status(400).json({error:'INVALID_ACTION'})
    }
    if(req.method==='POST') {
      const runId=String(req.body?.runId||''), status=String(req.body?.status||'')
      if(!RUN_ID.test(runId)||!WORKER_STATUSES.includes(status)) return res.status(400).json({error:'INVALID_UPDATE'})
      if(status==='completed') return res.status(403).json({error:'ISSUANCE_PHASE_DISABLED'})
      const {data:current,error:readError}=await admin.from('nfse_automation_runs').select('status').eq('id',runId).maybeSingle()
      if(readError) throw readError
      if(!current || !TRANSITIONS[current.status]?.includes(status)) return res.status(409).json({error:'INVALID_STATUS_TRANSITION'})
      const patch={status,updated_at:new Date().toISOString()}
      if(status==='failed') patch.error_code=String(req.body?.errorCode||'WORKER_FAILED').replace(/[^A-Z0-9_:-]/gi,'_').slice(0,80)
      if(status==='preview_ready') {
        const result=req.body?.result
        if(!result || result.issuance_enabled !== false || result.phase !== 'form_discovery') return res.status(400).json({error:'INVALID_PREVIEW_RESULT'})
        patch.result={phase:'form_discovery',issuance_enabled:false,transaction_id:String(result.transaction_id||''),detected_fields:Array.isArray(result.detected_fields)?result.detected_fields.slice(0,40):[],invoice_form_detected:result.invoice_form_detected===true}
      }
      const {data,error}=await admin.from('nfse_automation_runs').update(patch).eq('id',runId).eq('status',current.status).select('id').maybeSingle()
      if(error) throw error
      if(!data) return res.status(409).json({error:'RUN_STATE_CHANGED'})
      return res.status(200).json({ok:true})
    }
    res.setHeader('Allow','GET, POST'); return res.status(405).json({error:'METHOD_NOT_ALLOWED'})
  } catch(error) {
    console.error('[nfse.worker]',error?.message||'unknown')
    return res.status(500).json({error:'WORKER_OPERATION_FAILED'})
  }
}

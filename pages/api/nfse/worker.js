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
        if(!result || result.issuance_enabled !== false || !['form_discovery','menu_diagnostic'].includes(result.phase)) return res.status(400).json({error:'INVALID_PREVIEW_RESULT'})
        const candidates=Array.isArray(result.menu_candidates)?result.menu_candidates.slice(0,30).map(item=>({tag:String(item.tag||'').slice(0,12),role:String(item.role||'').slice(0,40),text:String(item.text||'').slice(0,90),ariaLabel:String(item.ariaLabel||'').slice(0,90),title:String(item.title||'').slice(0,90),hrefPath:String(item.hrefPath||'').slice(0,160),testId:String(item.testId||'').slice(0,90),ariaCurrent:String(item.ariaCurrent||'').slice(0,30),parentTag:String(item.parentTag||'').slice(0,12),parentRole:String(item.parentRole||'').slice(0,40),visible:item.visible===true,disabled:item.disabled===true})):[]
        patch.result={phase:result.phase,issuance_enabled:false,transaction_id:String(result.transaction_id||''),detected_fields:Array.isArray(result.detected_fields)?result.detected_fields.slice(0,40).map(x=>String(x).slice(0,120)):[],invoice_form_detected:result.invoice_form_detected===true,menu_candidate_count:Math.max(0,Math.min(30,Number(result.menu_candidate_count)||0)),menu_candidates:candidates,page_title:String(result.page_title||'').slice(0,120),page_path:String(result.page_path||'').slice(0,240)}
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

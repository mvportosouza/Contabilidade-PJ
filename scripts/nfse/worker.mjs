import { pathToFileURL } from 'node:url'
import { buildNfseDraft } from './preview-mapping.mjs'
import { inspectContabilizeiForm, inspectContabilizeiMenu } from './contabilizei-preview.mjs'

const playwrightEntry = process.env.NFSE_NODE_PATH ? pathToFileURL(`${process.env.NFSE_NODE_PATH}/playwright/index.mjs`).href : 'playwright'
const { chromium } = await import(playwrightEntry)
const baseUrl = process.env.NFSE_API_BASE_URL?.replace(/\/$/, '')
const bridgeToken = process.env.NFSE_WORKER_BRIDGE_TOKEN
const runId = process.env.NFSE_RUN_ID
if (!baseUrl || !bridgeToken || !runId) throw new Error('NFSE_WORKER_ENV_MISSING')

async function api(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { 'content-type':'application/json', 'x-nfse-worker-token':bridgeToken, ...(options.headers||{}) } })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `NFSE_API_${response.status}`)
  return data
}
const setStatus = (status, extra = {}) => api('/api/nfse/worker', { method:'POST', body:JSON.stringify({ runId, status, ...extra }) })

async function clickOtpConfirm(page) {
  const buttons=page.getByRole('button',{name:/confirmar|verificar|validar|continuar|enviar/i})
  for(let i=0,n=await buttons.count();i<n;i++) { const b=buttons.nth(i); if(await b.isVisible().catch(()=>false)&&await b.isEnabled().catch(()=>false)){await b.click({timeout:10000});return} }
  throw new Error('OTP_CONFIRM_BUTTON_NOT_FOUND')
}
async function waitForOtp(page) {
  await setStatus('awaiting_otp')
  const deadline=Date.now()+180000
  while(Date.now()<deadline){
    const {code}=await api(`/api/nfse/worker?runId=${encodeURIComponent(runId)}&action=otp`)
    if(code){
      const inputs=page.locator('input:visible'), otp=[]
      for(let i=0,n=await inputs.count();i<n;i++){const el=inputs.nth(i);if(await el.getAttribute('maxlength')==='1'||await el.getAttribute('autocomplete')==='one-time-code')otp.push(el)}
      if(otp.length>=6){for(let i=0;i<6;i++)await otp[i].fill(code[i])}
      else {let done=false;for(let i=(await inputs.count())-1;i>=0;i--){const el=inputs.nth(i);const meta=`${await el.getAttribute('name')||''} ${await el.getAttribute('placeholder')||''}`;if(/senha|password/i.test(meta)||await el.getAttribute('type')==='password')continue;if(await el.isEditable().catch(()=>false)){await el.fill(code);done=true;break}}if(!done)throw new Error('OTP_FIELD_NOT_FOUND')}
      await setStatus('validating_access'); await clickOtpConfirm(page); return
    }
    await page.waitForTimeout(2000)
  }
  throw new Error('OTP_TIMEOUT')
}
async function waitAuth(page){
  const deadline=Date.now()+60000
  while(Date.now()<deadline){
    const text=(await page.locator('body').innerText().catch(()=>'' )).replace(/\s+/g,' ')
    if(/código inválido|código expirado|código incorreto|não foi possível validar/i.test(text))throw new Error('OTP_REJECTED')
    const otp=await page.getByText(/insira o código de verificação|código de verificação/i).first().isVisible().catch(()=>false)
    const pass=await page.getByLabel(/senha/i).first().isVisible().catch(()=>false)
    if(!otp&&!pass&&!/login|sign.?in|autentica/i.test(new URL(page.url()).pathname))return
    await page.waitForTimeout(1500)
  }
  throw new Error('AUTH_OUTCOME_TIMEOUT')
}
function safeFieldNames(state){
  return (state.inputs||[]).map(x=>[x.tag,x.type,x.label,x.aria,x.placeholder,x.name].filter(Boolean).join(':').slice(0,120)).filter(Boolean).slice(0,40)
}
let browser
try{
  const job=await api(`/api/nfse/worker?runId=${encodeURIComponent(runId)}&action=claim`)
  const tx=job.payload?.[0]
  buildNfseDraft(tx)
  await setStatus('preparing_draft')
  browser=await chromium.launch({headless:true})
  const context=await browser.newContext({viewport:{width:1440,height:1000}})
  const page=await context.newPage()
  await page.goto('https://app.contabilizei.com.br/',{waitUntil:'domcontentloaded',timeout:60000})
  await page.getByLabel(/usuário|e-mail|cpf/i).first().fill(job.credentials.email)
  await page.getByLabel(/senha/i).first().fill(job.credentials.password)
  await page.getByRole('button',{name:/^entrar$/i}).click()
  await page.getByText(/insira o código de verificação/i).waitFor({state:'visible',timeout:30000})
  await waitForOtp(page); await waitAuth(page)

  // Discover possible menu controls without clicking any ambiguous item.
  const menuState=await inspectContabilizeiMenu(page)
  const unique=menuState.candidates.length===1
  if(!unique){
    await setStatus('preview_ready',{result:{phase:'menu_diagnostic',issuance_enabled:false,transaction_id:String(tx.id),invoice_form_detected:false,detected_fields:[],menu_candidates:menuState.candidates,menu_candidate_count:menuState.candidates.length,page_title:menuState.title,page_path:menuState.url}})
  } else {
    const candidate=menuState.candidates[0]
    const locator=page.locator(`${candidate.tag}[${candidate.tag==='a'?'href':'role'}]`).filter({hasText:candidate.text}).first()
    // Still do not click unless the unique visible candidate is an actual link with a path.
    if(candidate.tag!=='a'||!candidate.hrefPath){
      await setStatus('preview_ready',{result:{phase:'menu_diagnostic',issuance_enabled:false,transaction_id:String(tx.id),invoice_form_detected:false,detected_fields:[],menu_candidates:menuState.candidates,menu_candidate_count:1,page_title:menuState.title,page_path:menuState.url}})
    } else {
      const links=page.locator('a').filter({hasText:candidate.text})
      if(await links.count()!==1||!await links.first().isVisible().catch(()=>false)){
        await setStatus('preview_ready',{result:{phase:'menu_diagnostic',issuance_enabled:false,transaction_id:String(tx.id),invoice_form_detected:false,detected_fields:[],menu_candidates:menuState.candidates,menu_candidate_count:1,page_title:menuState.title,page_path:menuState.url}})
      } else {
        await links.first().click(); await page.waitForLoadState('domcontentloaded').catch(()=>{})
        const state=await inspectContabilizeiForm(page)
        await setStatus('preview_ready',{result:{phase:'form_discovery',issuance_enabled:false,transaction_id:String(tx.id),invoice_form_detected:state.invoiceFormDetected,detected_fields:safeFieldNames(state),menu_candidates:menuState.candidates,menu_candidate_count:1,page_title:state.title,page_path:state.url}})
      }
    }
  }
}catch(error){
  const code=String(error?.message||'WORKER_FAILED').replace(/[^A-Z0-9_:-]/gi,'_').slice(0,80)
  try{await setStatus('failed',{errorCode:code})}catch{}
  console.error('[nfse.discovery]',code); process.exitCode=1
}finally{if(browser)await browser.close().catch(()=>{})}

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
function previewResult(tx, phase, menuState, extra = {}) {
  return {
    phase,
    issuance_enabled:false,
    transaction_id:String(tx.id),
    invoice_form_detected:extra.invoice_form_detected===true,
    detected_fields:extra.detected_fields||[],
    menu_candidate_count:menuState.candidates.length,
    menu_candidates:menuState.candidates,
    page_title:extra.page_title||menuState.title,
    page_path:extra.page_path||menuState.url,
  }
}
async function clickExactControl(page, textPattern, errorCode) {
  const controls=page.locator('a:visible,button:visible,[role="link"]:visible,[role="button"]:visible,[role="menuitem"]:visible')
  const matches=[]
  const count=await controls.count()
  for(let i=0;i<count;i++){
    const el=controls.nth(i)
    const label=[await el.innerText().catch(()=>''),await el.getAttribute('aria-label').catch(()=>''),await el.getAttribute('title').catch(()=>'' )].join(' ').replace(/\s+/g,' ').trim()
    if(textPattern.test(label)) matches.push({el,label})
  }
  if(matches.length!==1) throw new Error(`${errorCode}:${matches.length}`)
  if(!await matches[0].el.isEnabled().catch(()=>true)) throw new Error(`${errorCode}_DISABLED`)
  await matches[0].el.click({timeout:12000})
  await page.waitForTimeout(700)
  return matches[0].label.slice(0,120)
}
let browser
try{
  const job=await api(`/api/nfse/worker?runId=${encodeURIComponent(runId)}&action=claim`)
  const tx=job.payload?.[0]
  buildNfseDraft(tx)

  browser=await chromium.launch({headless:true})
  const context=await browser.newContext({viewport:{width:1440,height:1000}})
  const page=await context.newPage()
  await page.goto('https://app.contabilizei.com.br/',{waitUntil:'domcontentloaded',timeout:60000})
  await page.getByLabel(/usuário|e-mail|cpf/i).first().fill(job.credentials.email)
  await page.getByLabel(/senha/i).first().fill(job.credentials.password)
  await page.getByRole('button',{name:/^entrar$/i}).click()
  await page.getByText(/insira o código de verificação/i).waitFor({state:'visible',timeout:30000})
  await waitForOtp(page)
  await waitAuth(page)
  await setStatus('preparing_draft')

  // Contabilizei may show a certificate promotion modal. It is not an instruction
  // to use the city-hall issuance path. Dismiss only via a uniquely labelled close/defer control.
  let menuState=await inspectContabilizeiMenu(page)
  if(menuState.certificateModalVisible){
    const dismissed=await menuState.dismissCertificateModal()
    if(!dismissed){
      await setStatus('preview_ready',{result:previewResult(tx,'menu_diagnostic',menuState)})
      process.exitCode=0
    } else {
      menuState=await inspectContabilizeiMenu(page)
    }
  }

  if(!menuState.certificateModalVisible){
    // The user's supplied screenshots show the platform's own navigation:
    // open the navigation menu, then select "Emitir nota fiscal".
    const menuTriggers=page.locator('button[aria-label*="menu" i],button[title*="menu" i],[data-testid*="menu" i]:visible,[aria-label*="navega" i]:visible')
    const triggerCount=await menuTriggers.count().catch(()=>0)
    if(triggerCount===1 && await menuTriggers.first().isVisible().catch(()=>false)){
      await menuTriggers.first().click({timeout:8000})
      await page.waitForTimeout(500)
    }

    const issueLink=page.getByText(/^Emitir nota fiscal$/i)
    const issueCount=await issueLink.count().catch(()=>0)
    if(issueCount===1 && await issueLink.first().isVisible().catch(()=>false)){
      await issueLink.first().click({timeout:10000})
      await page.waitForLoadState('domcontentloaded').catch(()=>{})
      await page.waitForTimeout(700)
    }

    // The next screen from the supplied screenshots has an explicit "Emitir nova nota" action.
    const newInvoice=page.getByRole('button',{name:/^emitir nova nota$/i})
    const newCount=await newInvoice.count().catch(()=>0)
    if(newCount===1 && await newInvoice.first().isVisible().catch(()=>false)){
      await newInvoice.first().click({timeout:10000})
      await page.waitForTimeout(1000)
      const form=await inspectContabilizeiForm(page)
      const finalMenu=await inspectContabilizeiMenu(page)
      await setStatus('preview_ready',{result:previewResult(tx,'form_discovery',finalMenu,{invoice_form_detected:form.invoiceFormDetected,detected_fields:safeFieldNames(form),page_title:form.title,page_path:form.url})})
    } else {
      const finalMenu=await inspectContabilizeiMenu(page)
      await setStatus('preview_ready',{result:previewResult(tx,'menu_diagnostic',finalMenu)})
    }
  }
}catch(error){
  const code=String(error?.message||'WORKER_FAILED').replace(/[^A-Z0-9_:-]/gi,'_').slice(0,80)
  try{await setStatus('failed',{errorCode:code})}catch{}
  console.error('[nfse.discovery]',code); process.exitCode=1
}finally{if(browser)await browser.close().catch(()=>{})}

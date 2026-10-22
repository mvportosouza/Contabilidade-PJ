import { useEffect, useState } from "react";
import { Card, Field, MoneyIn, CloseBtn } from "../AppUI";
import { fmtBRL, parseBRL } from "../appShared";

const CATEGORIES = ["Despesas médicas", "Plano de saúde", "Previdência PGBL", "Educação", "Previdência oficial / INSS", "Dependentes", "Pensão alimentícia", "Outras despesas / verificar elegibilidade"];
const blank = () => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, data: new Date().toISOString().slice(0,10), categoria: CATEGORIES[0], descricao: "", valor: "", beneficiario: "Titular", comprovante: "Sim", reembolso: "", prestador: "", documento: "" });
const inputStyle = { width:"100%",boxSizing:"border-box",background:"white",border:"1px solid #E0D8CE",borderRadius:12,padding:"11px 12px",fontSize:13,fontFamily:"inherit",color:"#1A1A1A" };

export function PlanejamentoPF({ year, month, C, txs = [], plMap = {}, irrfMap = {}, pfOtherIncomeMap = {}, calcINSS, calcIRRF }) {
  const [items,setItems] = useState([]);
  const [loaded,setLoaded] = useState(false);
  const [form,setForm] = useState(blank);
  const [editing,setEditing] = useState(false);
  const [view,setView] = useState("mensal");
  const [search,setSearch] = useState("");
  const [showForm,setShowForm] = useState(false);
  useEffect(() => { let active = true; if (!loaded && typeof window !== "undefined") { import("../../lib/storage").then(async ({sGet}) => { const data = await sGet("pj_pf_despesas") || []; if (!active) return; setItems(Array.isArray(data)?data:[]); setLoaded(true); }); } return () => { active = false; }; }, [loaded]);
  const persistItems = async next => { setItems(next); const {sSet}=await import("../../lib/storage"); await sSet("pj_pf_despesas",next); };

  const yearItems = items.filter(x => Number(String(x.data||"").slice(0,4)) === Number(year));
  const monthItems = yearItems.filter(x => Number(String(x.data||"").slice(5,7)) === Number(month)+1);
  const displayed = (view === "mensal" ? monthItems : yearItems).filter(x => `${x.descricao} ${x.categoria} ${x.prestador} ${x.documento}`.toLowerCase().includes(search.toLowerCase()));
  const total = list => list.reduce((sum,x)=>sum+Math.max(0,Number(x.valor)||0),0);
  const medical = list => list.filter(x=>["Despesas médicas","Plano de saúde"].includes(x.categoria)).reduce((s,x)=>s+Math.max(0,(Number(x.valor)||0)-(Number(x.reembolso)||0)),0);
  const periodItems = view === "mensal" ? monthItems : yearItems;
  const periodLabel = view === "mensal" ? `${String(month+1).padStart(2,"0")}/${year}` : String(year);
  const monthKeys = view === "mensal" ? [`${year}-${String(month+1).padStart(2,"0")}`] : Array.from({length:12},(_,i)=>`${year}-${String(i+1).padStart(2,"0")}`);
  const sumMap = map => monthKeys.reduce((sum,key)=>sum+Math.max(0,Number(map?.[key])||0),0);
  const plTotal = sumMap(plMap);
  const inssTotal = monthKeys.reduce((sum,key)=>{const pl=Math.max(0,Number(plMap?.[key])||0);return sum+(typeof calcINSS === "function" ? calcINSS(pl) : pl*0.11);},0);
  const irrfTotal = monthKeys.reduce((sum,key)=>{const pl=Math.max(0,Number(plMap?.[key])||0);const inss=typeof calcINSS === "function" ? calcINSS(pl) : pl*0.11;const manual=Number(irrfMap?.[key]);const value=Number.isFinite(manual)&&manual>0?manual:(typeof calcIRRF === "function" ? Number(calcIRRF(pl,{inss})?.valor||0) : 0);return sum+Math.max(0,value);},0);
  const otherIncome = view === "mensal" ? (Number(pfOtherIncomeMap?.[String(year)]?.valor)||0)/12 : Number(pfOtherIncomeMap?.[String(year)]?.valor)||0;
  const taxableIncome = plTotal + otherIncome;
  const pgblTotal = total((view === "mensal" ? monthItems : yearItems).filter(x=>x.categoria === "Previdência PGBL"));
  const pgblLimit = taxableIncome * .12;
  const eligiblePgbl = Math.min(pgblTotal,pgblLimit);
  const medicalNet = medical(periodItems);
  // Estimativa fiscal separa cálculo mensal de ajuste anual. Para o ano-calendário 2026,
  // aplica a tabela anual e a redução criada pela Lei 15.270/2025; não trata despesas médicas
  // como dedução automática quando não forem elegíveis/comprovadas.
  const annualMedical = medical(yearItems);
  const annualEducation = Math.min(3561.50, total(yearItems.filter(x => x.categoria === "Educação")));
  const annualLegalDeductions = inssTotal + eligiblePgbl + annualMedical + annualEducation;
  const annualSimplifiedDeduction = 17640;
  const annualDeductionUsed = Math.max(annualLegalDeductions, annualSimplifiedDeduction);
  const annualTaxBase = Math.max(0, taxableIncome - annualDeductionUsed);
  const annualBrackets = [
    {limite:29145.60, aliquota:0, deducao:0},
    {limite:33919.80, aliquota:.075, deducao:2185.92},
    {limite:45012.60, aliquota:.15, deducao:4729.91},
    {limite:55976.16, aliquota:.225, deducao:8105.85},
    {limite:Infinity, aliquota:.275, deducao:10904.66},
  ];
  const annualBracket = annualBrackets.find(b => annualTaxBase <= b.limite) || annualBrackets[annualBrackets.length-1];
  const annualNormalTax = Math.max(0, annualTaxBase * annualBracket.aliquota - annualBracket.deducao);
  const annualReduction = taxableIncome <= 60000 ? annualNormalTax : taxableIncome <= 88200 ? Math.max(0, 8429.73 - .095575 * taxableIncome) : 0;
  const annualTaxDue = Math.max(0, annualNormalTax - annualReduction);
  const estimateMonthTax = key => {
    const pl = Math.max(0, Number(plMap?.[key]) || 0);
    const inss = typeof calcINSS === "function" ? Math.max(0, Number(calcINSS(pl)) || 0) : pl * .11;
    const hasManual = Object.prototype.hasOwnProperty.call(irrfMap || {}, key) && Number.isFinite(Number(irrfMap[key]));
    const withheld = hasManual ? Math.max(0, Number(irrfMap[key]) || 0) : (typeof calcIRRF === "function" ? Math.max(0, Number(calcIRRF(pl, {inss})?.valor || 0)) : 0);
    const monthRows = yearItems.filter(x => String(x.data||"").slice(0,7) === key);
    const monthPgbl = total(monthRows.filter(x => x.categoria === "Previdência PGBL"));
    const monthMedical = medical(monthRows);
    const monthOtherIncome = (Number(pfOtherIncomeMap?.[String(year)]?.valor) || 0) / 12;
    const base = Math.max(0, pl + monthOtherIncome - inss - Math.min(monthPgbl, Math.max(0, pl + monthOtherIncome) * .12) - monthMedical);
    const estimatedTax = typeof calcIRRF === "function" ? Math.max(0, Number(calcIRRF(base, {inss:0})?.valor || 0)) : 0;
    return {withheld, estimatedTax, balance: withheld - estimatedTax};
  };
  const refundProjection = view === "anual"
    ? irrfTotal - annualTaxDue
    : monthKeys.reduce((sum,key)=>sum+estimateMonthTax(key).balance,0);
  const currencyInput = (label,value) => <Field label={label}><input value={fmtBRL(value)} readOnly aria-readonly="true" style={{...inputStyle,background:"#F7F4EF",color:C.navyMid}}/></Field>;
  return <div style={{display:"grid",gap:14}}>
    <div style={{background:"linear-gradient(135deg,#0F1E35,#1A3055)",borderRadius:18,padding:18,color:"white"}}><p style={{margin:0,fontSize:10,letterSpacing:2,color:"#C8A96E"}}>PLANEJAMENTO TRIBUTÁRIO</p><h2 style={{fontSize:21,fontWeight:"normal",margin:"7px 0"}}>Pessoa Física · IRPF</h2><p style={{margin:0,fontSize:12,color:"#E0D8CE"}}>Controle separado do CNPJ · {year}</p></div>
    <div style={{display:"flex",gap:8}}><button onClick={()=>setView("mensal")} style={{flex:1,padding:11,borderRadius:12,border:`1px solid ${view==="mensal"?C.navyMid:C.border}`,background:view==="mensal"?C.navyLight:"white",color:C.navyMid,fontFamily:"inherit"}}>Visão mensal</button><button onClick={()=>setView("anual")} style={{flex:1,padding:11,borderRadius:12,border:`1px solid ${view==="anual"?C.navyMid:C.border}`,background:view==="anual"?C.navyLight:"white",color:C.navyMid,fontFamily:"inherit"}}>Visão anual</button></div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><Card><p style={{margin:0,fontSize:10,color:C.muted}}>DESPESAS MÉDICAS LÍQUIDAS · {view==="mensal"?"MÊS":"ANO"}</p><p style={{margin:"7px 0 0",fontSize:17,fontWeight:"bold",color:C.navyMid}}>{fmtBRL(medicalNet)}</p></Card><Card><p style={{margin:0,fontSize:10,color:C.muted}}>PGBL CADASTRADO · {view==="mensal"?"MÊS":"ANO"}</p><p style={{margin:"7px 0 0",fontSize:17,fontWeight:"bold",color:C.gold}}>{fmtBRL(pgblTotal)}</p></Card></div>
    <Card><h3 style={{margin:"0 0 12px",fontSize:16,color:C.navy}}>Planejamento {view==="mensal"?"mensal":"anual"} do IRPF · {periodLabel}</h3>{currencyInput(`Pró-labore / rendimentos PJ (${view==="mensal"?"mês":"ano"})`,plTotal)}{currencyInput(`Previdência oficial / INSS (${view==="mensal"?"mês":"ano"})`,inssTotal)}{currencyInput(`IRRF / imposto já recolhido (${view==="mensal"?"mês":"ano"})`,irrfTotal)}{currencyInput(`Outros rendimentos PF (${view==="mensal"?"mês":"ano"})`,otherIncome)}<div style={{background:"#F8F1E5",borderRadius:12,padding:12,marginBottom:12}}><p style={{margin:0,fontSize:12,color:C.navy}}>Limite indicativo de dedução PGBL (12%): <b>{fmtBRL(pgblLimit)}</b></p><p style={{margin:"5px 0 0",fontSize:12,color:C.navy}}>Dedução potencial estimada: <b>{fmtBRL(eligiblePgbl)}</b></p>{view === "anual" && <><p style={{margin:"5px 0 0",fontSize:12,color:C.navy}}>Deduções legais estimadas: <b>{fmtBRL(annualLegalDeductions)}</b></p><p style={{margin:"5px 0 0",fontSize:12,color:C.navy}}>Desconto utilizado na simulação: <b>{annualDeductionUsed === annualSimplifiedDeduction ? "Simplificado" : "Deduções legais"} · {fmtBRL(annualDeductionUsed)}</b></p><p style={{margin:"5px 0 0",fontSize:12,color:C.navy}}>Imposto anual estimado após redução de 2026: <b>{fmtBRL(annualTaxDue)}</b></p></>}<div style={{borderTop:`1px solid ${C.border}`,marginTop:10,paddingTop:10}}><p style={{margin:0,fontSize:12,color:C.navy}}>Restituição potencial estimada / saldo de IRRF</p><p style={{margin:"5px 0 0",fontSize:21,fontWeight:"bold",color:refundProjection>=0?C.navyMid:C.red}}>{refundProjection>=0?fmtBRL(refundProjection):`Imposto potencial a pagar: ${fmtBRL(Math.abs(refundProjection))}`}</p></div><p style={{margin:"7px 0 0",fontSize:10,color:C.muted,lineHeight:1.5}}>Estimativa para acompanhamento, não é cálculo oficial da restituição. Na visão anual aplica a tabela anual do ano-calendário selecionado, a redução de 2026 quando aplicável e compara deduções legais estimadas com o desconto simplificado anual. Para 2026, rendimentos tributáveis sujeitos ao ajuste anual de até R$ 60.000 podem resultar em imposto devido zero pela redução anual. Confirme rendimentos, retenções, elegibilidade e comprovantes antes de tomar decisões.</p></div></Card>
    <Card><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:12}}><div><h3 style={{margin:0,fontSize:16,color:C.navy}}>Cadastro de Despesas Dedutíveis</h3><p style={{margin:"4px 0 0",fontSize:11,color:C.muted}}>{view==="mensal"?`Registros de ${String(month+1).padStart(2,"0")}/${year}`:`Registros de ${year}`}</p></div><button onClick={()=>{setForm(blank());setEditing(false);setShowForm(true)}} style={{border:0,borderRadius:11,padding:"10px 12px",background:C.navyMid,color:"white",fontFamily:"inherit",fontWeight:"bold",whiteSpace:"nowrap"}}>+ Cadastrar</button></div>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Pesquisar despesa..." style={{...inputStyle,marginBottom:12}}/>
      <p style={{fontSize:11,color:C.muted,margin:"0 0 10px"}}>{displayed.length} registro(s) · Total: <b>{fmtBRL(total(periodItems))}</b></p>
      {displayed.length===0?<p style={{fontSize:12,color:C.muted,textAlign:"center",padding:18}}>Nenhuma despesa cadastrada neste período.</p>:displayed.map(x=><div key={x.id} style={{borderTop:`1px solid ${C.border}`,padding:"12px 0",display:"flex",gap:8,alignItems:"flex-start"}}><div style={{flex:1,minWidth:0}}><p style={{margin:0,fontSize:13,fontWeight:"bold",color:C.text}}>{x.descricao||x.categoria}</p><p style={{margin:"3px 0",fontSize:11,color:C.gold}}>{x.categoria} · {x.data}</p><p style={{margin:0,fontSize:10,color:C.muted}}>{x.beneficiario}{x.prestador?` · ${x.prestador}`:""} · Comprovante: {x.comprovante}</p></div><div style={{textAlign:"right"}}><b style={{fontSize:13,color:C.navyMid}}>{fmtBRL(Number(x.valor)||0)}</b><div style={{display:"flex",gap:5,marginTop:6}}><button onClick={()=>{setForm({...x,valor:String(x.valor??"")});setEditing(true);setShowForm(true)}} style={{border:0,borderRadius:7,padding:5,background:C.navyLight,color:C.navyMid}}>Editar</button><button onClick={()=>persistItems(items.filter(i=>i.id!==x.id))} style={{border:0,borderRadius:7,padding:5,background:C.redLight,color:C.red}}>Excluir</button></div></div></div>)}
    </Card>
    {showForm&&<div role="dialog" aria-modal="true" style={{position:"fixed",inset:0,zIndex:60,background:"rgba(0,0,0,.5)",display:"flex",alignItems:"flex-end"}} onClick={e=>e.target===e.currentTarget&&setShowForm(false)}><div style={{background:"#FAF7F3",borderRadius:"24px 24px 0 0",width:"100%",maxWidth:430,margin:"0 auto",padding:"22px 20px 38px",maxHeight:"88vh",overflowY:"auto"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><h3 style={{margin:0,color:C.navy,fontSize:17}}>{editing?"Editar despesa":"Cadastro de Despesas Dedutíveis"}</h3><CloseBtn onClick={()=>setShowForm(false)}/></div>
      <Field label="Categoria"><select value={form.categoria} onChange={e=>setForm({...form,categoria:e.target.value})} style={inputStyle}>{CATEGORIES.map(x=><option key={x}>{x}</option>)}</select></Field><Field label="Descrição"><input value={form.descricao} onChange={e=>setForm({...form,descricao:e.target.value})} placeholder="Ex.: consulta odontológica" style={inputStyle}/></Field><Field label="Valor pago (R$)"><MoneyIn value={form.valor} onChange={v=>setForm({...form,valor:v})} placeholder="0,00"/></Field><Field label="Data do pagamento"><input type="date" value={form.data} onChange={e=>setForm({...form,data:e.target.value})} style={inputStyle}/></Field><Field label="Beneficiário ou responsável"><select value={form.beneficiario} onChange={e=>setForm({...form,beneficiario:e.target.value})} style={inputStyle}><option>Titular</option><option>Dependente</option><option>Outra pessoa</option></select></Field><Field label="Prestador / estabelecimento"><input value={form.prestador} onChange={e=>setForm({...form,prestador:e.target.value})} placeholder="Nome do profissional ou clínica" style={inputStyle}/></Field><Field label="CPF/CNPJ do prestador"><input value={form.documento} onChange={e=>setForm({...form,documento:e.target.value})} placeholder="Documento do prestador" style={inputStyle}/></Field><Field label="Valor reembolsado (R$)"><MoneyIn value={form.reembolso} onChange={v=>setForm({...form,reembolso:v})} placeholder="0,00"/></Field><Field label="Possui comprovante?"><select value={form.comprovante} onChange={e=>setForm({...form,comprovante:e.target.value})} style={inputStyle}><option>Sim</option><option>Não</option></select></Field><button onClick={async()=>{if(!form.data||!form.categoria||!(parseBRL(form.valor)>0)){alert("Informe a data, categoria e um valor maior que zero.");return;}const item={...form,valor:parseBRL(form.valor),reembolso:parseBRL(form.reembolso||"0")};const next=editing?items.map(x=>x.id===item.id?item:x):[item,...items];await persistItems(next);setShowForm(false);}} style={{width:"100%",padding:13,border:0,borderRadius:12,background:C.navyMid,color:"white",fontFamily:"inherit",fontWeight:"bold",marginTop:6}}>Salvar despesa</button>
    </div></div>}
  </div>;
}

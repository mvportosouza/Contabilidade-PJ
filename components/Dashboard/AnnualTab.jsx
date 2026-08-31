import { useState } from "react";
import { generateAnnualReportPdf } from "../../lib/pdf";
import { getAnnualStatistics } from "../../lib/statistics";
import {
  ResponsiveContainer,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  ComposedChart,
  Line,
  Tooltip,
  Cell,
} from "recharts";
import { Modal, Card, SmLabel, CloseBtn, ChkBox } from "../AppUI";
import { ReportButton } from "../Reports/ReportButton";
import { calculateHighIncomeEstimate } from "../../lib/highIncome";

export function AnualTab({txs,plMap,irrfMap,year,C,fmtBRL,calcIRRF,calcTributacao,calcINSS,pfOtherIncomeMap,savePfOtherIncome}){
  const MS=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const [taxDetail,setTaxDetail]=useState(null);
  const [otherModal,setOtherModal]=useState(false);
  const [otherDraft,setOtherDraft]=useState({descricao:"",valor:"",irrf:"",irrfExclusive:"",incluirBase:true,tributavel:true});
  const data=getAnnualStatistics(txs,plMap,irrfMap,year,calcIRRF,calcTributacao)
    .map((row,i)=>({...row,mes:MS[i]}));

  const otherKey=String(year);
  const otherIncome=pfOtherIncomeMap?.[otherKey] || {descricao:"",valor:0,irrf:0,irrfExclusive:0,incluirBase:true,tributavel:true};
  const annualIrrfPf=Array.from({length:12},(_,i)=>{
    const key=`${year}-${String(i+1).padStart(2,"0")}`;
    const pl=Number(plMap?.[key]||0);
    const inss=typeof calcINSS==="function"?calcINSS(pl):pl*0.11;
    return Object.prototype.hasOwnProperty.call(irrfMap||{},key) && Number(irrfMap[key])>0
      ? Number(irrfMap[key])
      : (typeof calcIRRF==="function" ? Number(calcIRRF(pl,{inss})?.valor||0) : 0);
  }).reduce((sum,v)=>sum+Math.max(0,v),0);

  const highIncome=calculateHighIncomeEstimate({
    transactions:txs,
    plMap,
    year,
    otherIncome,
    calcINSS,
    irrfPf:annualIrrfPf,
  });

  const openOtherModal=()=>{
    setOtherDraft({
      descricao:otherIncome.descricao||"",
      valor:otherIncome.valor?String(Math.round(Number(otherIncome.valor)*100)/100).replace(".",","):"",
      irrf:otherIncome.irrf?String(Math.round(Number(otherIncome.irrf)*100)/100).replace(".",","):"",
      irrfExclusive:otherIncome.irrfExclusive?String(Math.round(Number(otherIncome.irrfExclusive)*100)/100).replace(".",","):"",
      incluirBase:otherIncome.incluirBase!==false,
      tributavel:otherIncome.tributavel!==false,
    });
    setOtherModal(true);
  };
  const parseMoney=v=>Number(String(v||"").replace(/\./g,"").replace(",","."))||0;
  const saveOther=async()=>{
    const next={...pfOtherIncomeMap,[otherKey]:{
      descricao:String(otherDraft.descricao||"").trim(),
      valor:parseMoney(otherDraft.valor),
      irrf:parseMoney(otherDraft.irrf),
      irrfExclusive:parseMoney(otherDraft.irrfExclusive),
      incluirBase:Boolean(otherDraft.incluirBase),
      tributavel:Boolean(otherDraft.tributavel),
    }};
    await savePfOtherIncome(next);
    setOtherModal(false);
  };

  const fmtK=v=>v>=1000?`R$${(v/1000).toFixed(1)}k`:`R$${v.toFixed(0)}`;
  const pct=v=>`${Number(v||0).toFixed(1)}%`;
  const tooltipStyle={borderRadius:10,border:"none",boxShadow:"0 4px 12px rgba(0,0,0,0.12)",fontSize:12};
  const active=data.filter(d=>d.ativo);
  const best=active.length?active.reduce((a,b)=>b.lucro>a.lucro?b:a):null;
  const worst=active.length?active.reduce((a,b)=>b.lucro<a.lucro?b:a):null;

  const withMovingAverage=(rows,key)=>{
    let values=[];
    return rows.map((row)=>{
      values=[...values,Number(row[key]||0)].slice(-3);
      return {...row,mediaMovel:values.reduce((sum,v)=>sum+v,0)/values.length};
    });
  };

  const charts=[
    {label:"Receita total",key:"receita",color:C.navyMid,format:"money"},
    {label:"Despesas totais",key:"despesa",color:C.red,format:"money"},
    {label:"Lucro líquido",key:"lucro",color:"#2E7D32",format:"money"},
    {label:"Impostos pagos",key:"impostos",color:"#C0392B",format:"money",clickTax:true},
    {label:"Pró-labore",key:"pl",color:C.gold,format:"money"},
    {label:"INSS",key:"inss",color:"#8E44AD",format:"money"},
    {label:"IRRF PF",key:"irrf",color:"#C0392B",format:"money"},
    {label:"Distribuição de lucros",key:"distribuicao",color:"#B8860B",format:"money"},
    {label:"Margem líquida",key:"margem",color:C.navyMid,format:"percent"},
    {label:"Receita média mensal",key:"mediaReceitaAcumulada",color:"#5D6D7E",format:"money"},
    {label:"Melhor mês",key:"melhorMes",color:"#2E7D32",format:"money",highlight:"best"},
    {label:"Pior mês",key:"piorMes",color:C.red,format:"money",highlight:"worst"},
    {label:"Evolução mês a mês",key:"evolucao",color:"#6C7A89",format:"money",evolution:true},
  ];

  const renderChart=(ch)=>{
    let chartData=active;
    if(ch.key==="melhorMes") chartData=active.map(d=>({...d,melhorMes:d.isMelhor?d.lucro:0}));
    else if(ch.key==="piorMes") chartData=active.map(d=>({...d,piorMes:d.isPior?d.lucro:0}));
    else if(ch.key==="evolucao") chartData=active.map((d,i)=>({...d,evolucao:i===0?0:d.receita-active[i-1].receita}));
    chartData=withMovingAverage(chartData,ch.key);

    const total=ch.key==="evolucao"
      ? chartData.reduce((s,d)=>s+d.evolucao,0)
      : chartData.reduce((s,d)=>s+Number(d[ch.key]||0),0);
    const avg=ch.format==="percent"
      ? chartData.length?chartData.reduce((s,d)=>s+Number(d[ch.key]||0),0)/chartData.length:0
      : ch.key==="mediaReceitaAcumulada"
        ? (active[active.length-1]?.mediaReceitaAcumulada || 0)
        : chartData.length?total/chartData.length:0;
    const headlineValue=ch.key==="mediaReceitaAcumulada"
      ? fmtBRL(avg)
      : ch.format==="percent"
        ? pct(avg)
        : fmtBRL(total);

    return (
      <div key={ch.key} style={{background:"white",borderRadius:18,padding:"18px",marginBottom:12,boxShadow:"0 2px 16px rgba(0,0,0,0.06)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
          <p style={{margin:0,fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>{ch.label}</p>
          <div style={{textAlign:"right"}}>
            <p style={{margin:0,fontSize:14,fontWeight:"bold",color:ch.color}}>
              {headlineValue}
            </p>
            {ch.format!=="percent" && ch.key!=="evolucao" && ch.key!=="mediaReceitaAcumulada" && <p style={{margin:"2px 0 0",fontSize:10,color:C.muted}}>Média: {fmtBRL(avg)}/mês</p>}
            {ch.key==="mediaReceitaAcumulada" && <p style={{margin:"2px 0 0",fontSize:10,color:C.muted}}>Média acumulada até o mês</p>}
            {ch.key==="evolucao" && <p style={{margin:"2px 0 0",fontSize:10,color:C.muted}}>Variação acumulada</p>}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <ComposedChart data={chartData} margin={{top:8,right:8,left:-8,bottom:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F0EBE3" vertical={false}/>
            <XAxis dataKey="mes" tick={{fontSize:10,fill:C.muted}} axisLine={false} tickLine={false}/>
            <YAxis
              tick={{fontSize:9,fill:C.muted}}
              tickFormatter={ch.format==="percent" ? pct : fmtK}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            <Tooltip
              formatter={(v,name)=>[
                ch.format==="percent"?pct(v):fmtBRL(v),
                name==="mediaMovel"?"Média móvel (3)":ch.label
              ]}
              contentStyle={tooltipStyle}
              labelStyle={{color:C.text,fontWeight:"600"}}
            />
            {ch.key==="mediaReceitaAcumulada" && (
              <ReferenceLine y={active.length?active[active.length-1].mediaReceitaAcumulada:0} stroke={ch.color} strokeDasharray="5 4" strokeWidth={1.5}/>
            )}
            {ch.format==="percent" && <ReferenceLine y={0} stroke="#AAA"/>}
            <Bar
              dataKey={ch.key}
              fill={ch.color}
              radius={[4,4,0,0]}
              maxBarSize={30}
              onClick={(entry)=>{
                const row = entry?.payload || entry;
                if(ch.clickTax && row?.mes) setTaxDetail(row);
              }}
              style={{cursor:ch.clickTax?"pointer":"default"}}
            >
              {(ch.highlight==="best" || ch.highlight==="worst") ? chartData.map((d,i)=>(
                <Cell key={i} fill={d.isMelhor&&ch.highlight==="best" ? "#2E7D32" : d.isPior&&ch.highlight==="worst" ? C.red : ch.color}/>
              )) : null}
            </Bar>
            <Line type="monotone" dataKey="mediaMovel" stroke="#6C7A89" strokeWidth={2} dot={false} activeDot={{r:3}}/>
          </ComposedChart>
        </ResponsiveContainer>
        {ch.key==="melhorMes" && <p style={{margin:"8px 0 0",fontSize:11,color:C.muted}}>Melhor mês: <strong>{best?.mes || "—"}</strong>{best ? ` · ${fmtBRL(best.lucro)}` : ""}</p>}
        {ch.key==="piorMes" && <p style={{margin:"8px 0 0",fontSize:11,color:C.muted}}>Pior mês: <strong>{worst?.mes || "—"}</strong>{worst ? ` · ${fmtBRL(worst.lucro)}` : ""}</p>}
        {ch.clickTax && <p style={{margin:"8px 0 0",fontSize:10,color:"#AAA"}}>Toque em uma barra para ver DAS + INSS + IRRF PF.</p>}
      </div>
    );
  };

  const groupedData=withMovingAverage(active,"receita").map((d,i)=>({...d,receitaMediaMovel:d.mediaMovel,despesaMediaMovel:0,lucroMediaMovel:0})).map((d,i,arr)=>{ const w=arr.slice(Math.max(0,i-2),i+1); return {...d,despesaMediaMovel:w.reduce((s,x)=>s+x.despesa,0)/w.length,lucroMediaMovel:w.reduce((s,x)=>s+x.lucro,0)/w.length}; });

  return(<>
    <ReportButton onGenerate={() => generateAnnualReportPdf({ year, rows: data })} />
    <p style={{margin:"0 0 14px",fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>Dados Anuais · {year}</p>

    {year===2026 && <div style={{background:"white",borderRadius:18,padding:"18px",marginBottom:14,boxShadow:"0 2px 16px rgba(0,0,0,0.06)",border:`1px solid ${highIncome.status==="sujeito"?"#F0C7C1":C.border}`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,marginBottom:14}}>
        <div>
          <p style={{margin:0,fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>Alta Renda · IRPF {year}</p>
          <p style={{margin:"5px 0 0",fontSize:22,fontWeight:"bold",color:C.navyMid}}>{fmtBRL(highIncome.annualIncome)}</p>
          <p style={{margin:"3px 0 0",fontSize:10,color:C.muted}}>Renda anual consolidada da pessoa física</p>
        </div>
        <div style={{textAlign:"right"}}>
          <p style={{margin:0,fontSize:11,fontWeight:"bold",color:highIncome.status==="sujeito"?C.red:highIncome.status==="proximo"?"#B87916":"#2E7D32"}}>
            {highIncome.status==="sujeito"?"🔴 Enquadrado — diferença estimada":highIncome.status==="compensado"?"🟢 Enquadrado — sem diferença estimada":highIncome.status==="proximo"?"⚠️ Próximo de R$ 600 mil":"✅ Abaixo de R$ 600 mil"}
          </p>
          <p style={{margin:"4px 0 0",fontSize:10,color:C.muted}}>Limite: R$ 600.000</p>
        </div>
      </div>

      <div style={{background:C.navyLight,borderRadius:13,padding:"12px 13px",marginBottom:10}}>
        {[
          ["Renda anual",highIncome.annualIncome,C.navyMid],
          ["Base relevante",highIncome.minimumBase,C.gold],
          ["Alíquota mínima estimada",highIncome.rate,highIncome.rate>0?C.red:"#2E7D32","percent"],
          ["IRPF regular estimado",highIncome.regularIrpf,C.navyMid],
          ["IRRF PF",highIncome.irrfPf,C.red],
          ["IRRF PJ",highIncome.irrfPj,C.red],
          ["IRRF outros",highIncome.otherIrrf,C.red],
          ["INSS",highIncome.inss,"#8E44AD"],
          ["Tributação mínima estimada",highIncome.minimumTax,highIncome.minimumTax>0?C.red:"#2E7D32"],
          ["Diferença estimada",highIncome.difference,highIncome.difference>0?C.red:"#2E7D32"],
        ].map(([label,value,color],i)=>(
          <div key={label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:i<9?`1px solid rgba(224,216,206,0.65)`:"none"}}>
            <span style={{fontSize:11,color:C.text}}>{label}</span>
            <strong style={{fontSize:12,color}}>{i===2 ? `${(value*100).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}%` : fmtBRL(value)}</strong>
          </div>
        ))}
      </div>
      {highIncome.status!=="fora" && highIncome.status!=="proximo" && (
        <p style={{margin:"0 0 6px",fontSize:9,color:C.muted,lineHeight:1.4}}>
          Enquadramento pela regra de altas rendas: o valor acima é a estimativa gerencial do mínimo antes das compensações aplicáveis.
        </p>
      )}

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0 2px"}}>
        <div>
          <p style={{margin:0,fontSize:11,color:C.text,fontWeight:"600"}}>Outros rendimentos PF</p>
          <p style={{margin:"2px 0 0",fontSize:10,color:C.muted}}>{otherIncome.valor?`${otherIncome.descricao||"Informado manualmente"} · ${fmtBRL(otherIncome.valor)}`:"Nenhum informado"}</p>
        </div>
        <button onClick={openOtherModal} style={{background:C.navyLight,border:`1px solid ${C.border}`,borderRadius:10,padding:"7px 10px",color:C.navyMid,fontSize:11,fontFamily:"inherit",fontWeight:"600",cursor:"pointer"}}>Editar</button>
      </div>

      {highIncome.status==="sujeito" && <div style={{background:C.redLight,borderRadius:11,padding:"9px 11px",marginTop:10,fontSize:10,color:C.red,lineHeight:1.45}}>A estimativa indica possível diferença de tributação mínima após as compensações consideradas. Revise os rendimentos e retenções antes da DIRPF.</div>}
      {highIncome.status==="proximo" && <div style={{background:"#FFF8E8",borderRadius:11,padding:"9px 11px",marginTop:10,fontSize:10,color:"#8A641F",lineHeight:1.45}}>Faltam {fmtBRL(highIncome.thresholdRemaining)} para alcançar R$ 600.000 no cenário informado.</div>}
      <p style={{margin:"10px 0 0",fontSize:9,color:"#999",lineHeight:1.45}}>Este cálculo é uma estimativa gerencial e não substitui o cálculo oficial do IRPF.</p>
    </div>}
    {charts.map(renderChart)}
    <div style={{background:"white",borderRadius:18,padding:"18px",marginBottom:12,boxShadow:"0 2px 16px rgba(0,0,0,0.06)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
        <p style={{margin:0,fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>Receita × Despesa × Lucro</p>
        <p style={{margin:0,fontSize:14,fontWeight:"bold",color:C.navyMid}}>{fmtBRL(data.reduce((s,d)=>s+d.lucro,0))}</p>
      </div>
      <ResponsiveContainer width="100%" height={200}>
         <ComposedChart data={groupedData} margin={{top:8,right:8,left:-8,bottom:0}}>
           <CartesianGrid strokeDasharray="3 3" stroke="#F0EBE3" vertical={false}/>
           <XAxis dataKey="mes" tick={{fontSize:10,fill:C.muted}} axisLine={false} tickLine={false}/>
           <YAxis tick={{fontSize:9,fill:C.muted}} tickFormatter={fmtK} axisLine={false} tickLine={false} width={48}/>
           <Tooltip
             formatter={(v,n)=>[fmtBRL(v),n==="receita"?"Receita":n==="despesa"?"Despesa":n==="lucro"?"Lucro":n==="receitaMediaMovel"?"Média móvel receita":n==="despesaMediaMovel"?"Média móvel despesa":"Média móvel lucro"]}
             contentStyle={tooltipStyle}
             labelStyle={{color:C.text,fontWeight:"600"}}
           />
           <Bar dataKey="receita" fill={C.navyMid} radius={[4,4,0,0]} maxBarSize={18}/>
           <Bar dataKey="despesa" fill={C.red} radius={[4,4,0,0]} maxBarSize={18}/>
           <Bar dataKey="lucro" fill="#2E7D32" radius={[4,4,0,0]} maxBarSize={18}/>
           <Line type="monotone" dataKey="receitaMediaMovel" stroke={C.navyMid} strokeWidth={2} dot={false}/>
           <Line type="monotone" dataKey="despesaMediaMovel" stroke={C.red} strokeWidth={2} dot={false}/>
           <Line type="monotone" dataKey="lucroMediaMovel" stroke="#2E7D32" strokeWidth={2} dot={false}/>
         </ComposedChart>
       </ResponsiveContainer>
     </div>

    {otherModal && (
      <Modal onClose={()=>setOtherModal(false)}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div><SmLabel>Outros rendimentos PF · {year}</SmLabel><p style={{margin:"4px 0 0",fontSize:12,color:C.muted}}>Informe apenas rendimentos pessoais relevantes para o planejamento anual.</p></div>
          <CloseBtn onClick={()=>setOtherModal(false)}/>
        </div>
        <label style={{display:"block",fontSize:11,color:C.muted,marginBottom:6}}>Descrição</label>
        <input value={otherDraft.descricao} onChange={e=>setOtherDraft(d=>({...d,descricao:e.target.value}))} placeholder="Ex.: aluguel, juros, exterior..." style={{width:"100%",boxSizing:"border-box",background:"white",border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 14px",fontSize:14,fontFamily:"inherit",marginBottom:12}}/>
        <label style={{display:"block",fontSize:11,color:C.muted,marginBottom:6}}>Valor anual</label>
        <input value={otherDraft.valor} onChange={e=>setOtherDraft(d=>({...d,valor:e.target.value}))} placeholder="0,00" inputMode="decimal" style={{width:"100%",boxSizing:"border-box",background:"white",border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 14px",fontSize:14,fontFamily:"inherit",marginBottom:12}}/>
        <label style={{display:"block",fontSize:11,color:C.muted,marginBottom:6}}>IRRF já retido · informativo</label>
        <input value={otherDraft.irrf} onChange={e=>setOtherDraft(d=>({...d,irrf:e.target.value}))} placeholder="0,00" inputMode="decimal" style={{width:"100%",boxSizing:"border-box",background:"white",border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 14px",fontSize:14,fontFamily:"inherit",marginBottom:12}}/>
        <label style={{display:"block",fontSize:11,color:C.muted,marginBottom:6}}>IRRF exclusivo compensável na mínima</label>
        <input value={otherDraft.irrfExclusive} onChange={e=>setOtherDraft(d=>({...d,irrfExclusive:e.target.value}))} placeholder="0,00" inputMode="decimal" style={{width:"100%",boxSizing:"border-box",background:"white",border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 14px",fontSize:14,fontFamily:"inherit",marginBottom:14}}/>
        <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:C.text,marginBottom:10,cursor:"pointer"}}><ChkBox checked={otherDraft.incluirBase} onChange={checked=>setOtherDraft(d=>({...d,incluirBase:checked}))}/> Incluir na base de altas rendas</label>
        <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:C.text,marginBottom:18,cursor:"pointer"}}><ChkBox checked={otherDraft.tributavel} onChange={checked=>setOtherDraft(d=>({...d,tributavel:checked}))}/> Considerar como rendimento tributável no ajuste anual</label>
        <button onClick={saveOther} style={{width:"100%",background:`linear-gradient(135deg,${C.navy},${C.navyMid})`,color:"white",border:"none",borderRadius:14,padding:"14px",fontSize:14,fontFamily:"inherit",fontWeight:"600",cursor:"pointer"}}>Salvar</button>
      </Modal>
    )}

    {taxDetail && (
      <Modal onClose={()=>setTaxDetail(null)}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div>
            <SmLabel>Impostos · {taxDetail.mes}</SmLabel>
            <p style={{margin:"4px 0 0",fontSize:20,fontWeight:"bold",color:C.navyMid}}>{fmtBRL(taxDetail.impostos)}</p>
          </div>
          <CloseBtn onClick={()=>setTaxDetail(null)}/>
        </div>
        {[
          ["DAS",taxDetail.das],
          ["INSS",taxDetail.inss],
          ["IRRF PF",taxDetail.irrf],
        ].map(([label,value])=>(
          <div key={label} style={{display:"flex",justifyContent:"space-between",padding:"12px 0",borderBottom:`1px solid ${C.border}`}}>
            <span style={{fontSize:14,color:C.text,fontWeight:"600"}}>{label}</span>
            <span style={{fontSize:14,color:C.navyMid,fontWeight:"bold"}}>{fmtBRL(value)}</span>
          </div>
        ))}
      </Modal>
    )}
  </>);
}

import { useState } from "react";
import { generateAnnualReportPdf, openPdfBlob } from "../../lib/pdf";
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
} from "recharts";
import { Modal, Card, SmLabel, MS, CloseBtn } from "../AppUI";

export function AnualTab({txs,plMap,irrfMap,year,C,fmtBRL,calcIRRF,calcTributacao}){
  const MS=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const [taxDetail,setTaxDetail]=useState(null);
  const data=getAnnualStatistics(txs,plMap,irrfMap,year,calcIRRF,calcTributacao)
    .map((row,i)=>({...row,mes:MS[i]}));

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
    {label:"IRRF",key:"irrf",color:"#C0392B",format:"money"},
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
        {ch.clickTax && <p style={{margin:"8px 0 0",fontSize:10,color:"#AAA"}}>Toque em uma barra para ver DAS + INSS + IRRF.</p>}
      </div>
    );
  };

  const groupedData=withMovingAverage(active,"receita").map((d,i)=>({...d,receitaMediaMovel:d.mediaMovel,despesaMediaMovel:0,lucroMediaMovel:0})).map((d,i,arr)=>{ const w=arr.slice(Math.max(0,i-2),i+1); return {...d,despesaMediaMovel:w.reduce((s,x)=>s+x.despesa,0)/w.length,lucroMediaMovel:w.reduce((s,x)=>s+x.lucro,0)/w.length}; });

  return(<>
    <ReportButton onGenerate={() => generateAnnualReportPdf({ year, rows: data })} />
    <p style={{margin:"0 0 14px",fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>Dados Anuais · {year}</p>
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
          ["IRRF",taxDetail.irrf],
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

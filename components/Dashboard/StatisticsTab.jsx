import { generateMonthlyReportPdf } from "../../lib/pdf";
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from "recharts";
import { getMonthlyStatistics } from "../../lib/statistics";
import { ReportButton } from "../Reports/ReportButton";
import { Card, SmLabel } from "../AppUI";

export function StatTab({monthTxs,receitas,despesas,month,year,MONTHS,C,fmtV,setDrillModal,fmtBRL,DAS,INSS,IRRF,CTB,PLef}){
  const stats=getMonthlyStatistics(monthTxs);
  const recMes=stats.receitas;
  const ECOLS={"Endodontia":C.navyMid,"Ortodontia":C.gold,"Outros":C.muted};
  return(<>
    <ReportButton onGenerate={() => generateMonthlyReportPdf({
      year,
      month,
      monthLabel: MONTHS[month],
      stats,
      taxes: { das: DAS, inss: INSS, irrf: IRRF, contabilidade: CTB, proLabore: PLef },
      transactions: monthTxs,
    })} />
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
      <p style={{margin:0,fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>{MONTHS[month]} {year}</p>
    </div>

    {/* Receita por Clínica por Especialidade */}
    <Card style={{marginBottom:12}}>
      <SmLabel style={{marginBottom:14}}>Receita por Clínica</SmLabel>
      {recMes.length===0?<p style={{textAlign:"center",color:"#CCC",fontSize:13,padding:"20px 0"}}>Nenhuma receita neste mês</p>
      :["Endodontia","Ortodontia","Outros"].map(esp=>{
        const items=esp==="Outros"?recMes.filter(t=>!t.especialidade||t.especialidade===""):recMes.filter(t=>t.especialidade===esp);
        if(items.length===0)return null;
        const byC=items.reduce((a,t)=>{a[t.nome]=(a[t.nome]||0)+t.valor;return a;},{});
        const tot=items.reduce((s,t)=>s+t.valor,0);
        return(
          <div key={esp} style={{marginBottom:16}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
              <span style={{fontSize:11,fontWeight:"700",color:ECOLS[esp],letterSpacing:1,textTransform:"uppercase"}}>{esp}</span>
              <span style={{fontSize:12,fontWeight:"bold",color:ECOLS[esp]}}>{fmtV(tot)}</span>
            </div>
            {Object.entries(byC).sort((a,b)=>b[1]-a[1]).map(([nome,val])=>(
              <div key={nome} style={{marginBottom:10,paddingLeft:8}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <span style={{fontSize:13,color:C.text}}>{nome}</span>
                  <span style={{fontSize:13,fontWeight:"bold",color:ECOLS[esp]}}>{fmtV(val)}</span>
                </div>
                <div style={{height:4,background:"#F0EBE3",borderRadius:4}}>
                  <div style={{height:4,width:`${receitas>0?(val/receitas)*100:0}%`,background:ECOLS[esp],borderRadius:4,opacity:0.8}}/>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </Card>

    {/* Especialidade pie */}
    {(()=>{
      const endo=recMes.filter(t=>t.especialidade==="Endodontia").reduce((s,t)=>s+t.valor,0);
      const orto=recMes.filter(t=>t.especialidade==="Ortodontia").reduce((s,t)=>s+t.valor,0);
      const outros=recMes.filter(t=>!t.especialidade||t.especialidade==="").reduce((s,t)=>s+t.valor,0);
      const tot=endo+orto+outros;
      const data=[endo>0&&{name:"Endodontia",value:endo,color:C.navyMid},orto>0&&{name:"Ortodontia",value:orto,color:C.gold},outros>0&&{name:"Outros",value:outros,color:C.muted}].filter(Boolean);
      if(tot===0)return null;
      return(
        <Card style={{marginBottom:12}}>
          <SmLabel style={{marginBottom:4}}>Receita por Especialidade</SmLabel>
          <p style={{margin:"2px 0 14px",fontSize:11,color:"#BBB"}}>{MONTHS[month]} {year} · toque para detalhar</p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart><Pie data={data} cx="50%" cy="50%" outerRadius={75} dataKey="value" label={({percent})=>`${(percent*100).toFixed(0)}%`} labelLine={false} onClick={e=>setDrillModal({title:e.name,items:e.name==="Outros"?recMes.filter(t=>!t.especialidade||t.especialidade===""):recMes.filter(t=>t.especialidade===e.name)})}>
              {data.map((e,i)=><Cell key={i} fill={e.color} style={{cursor:"pointer"}}/>)}
            </Pie><Tooltip formatter={v=>fmtBRL(v)}/><Legend onClick={e=>setDrillModal({title:e.value,items:e.value==="Outros"?recMes.filter(t=>!t.especialidade||t.especialidade===""):recMes.filter(t=>t.especialidade===e.value)})} wrapperStyle={{cursor:"pointer"}}/></PieChart>
          </ResponsiveContainer>
          {data.map(d=>(
            <button key={d.name} onClick={()=>setDrillModal({title:d.name,items:d.name==="Outros"?recMes.filter(t=>!t.especialidade||t.especialidade===""):recMes.filter(t=>t.especialidade===d.name)})} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"#F8F8F8",borderRadius:10,padding:"10px 14px",border:"1px solid #EEE",borderLeftWidth:4,borderLeftColor:d.color,cursor:"pointer",fontFamily:"inherit",width:"100%",textAlign:"left",marginBottom:8}}>
              <span style={{fontSize:13,color:C.text,fontWeight:"600"}}>{d.name}</span>
              <div style={{textAlign:"right"}}><p style={{margin:0,fontSize:13,fontWeight:"bold",color:d.color}}>{fmtV(d.value)}</p><p style={{margin:0,fontSize:11,color:"#AAA"}}>{tot>0?((d.value/tot)*100).toFixed(1):0}%</p></div>
            </button>
          ))}
        </Card>
      );
    })()}

    {/* Receitas vs Despesas pie */}
    {(()=>{
      const tot=receitas+despesas;
      const data=[receitas>0&&{name:"Receitas",value:receitas,color:C.navyMid},despesas>0&&{name:"Despesas",value:despesas,color:C.red}].filter(Boolean);
      if(tot===0)return null;
      return(
        <Card>
          <SmLabel style={{marginBottom:4}}>Receitas vs Despesas</SmLabel>
          <p style={{margin:"2px 0 14px",fontSize:11,color:"#BBB"}}>{MONTHS[month]} {year} · toque para detalhar</p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart><Pie data={data} cx="50%" cy="50%" outerRadius={75} dataKey="value" label={({percent})=>`${(percent*100).toFixed(0)}%`} labelLine={false} onClick={e=>setDrillModal({title:e.name,items:monthTxs.filter(t=>e.name==="Receitas"?t.tipo==="receita":t.tipo==="despesa")})}>
              {data.map((e,i)=><Cell key={i} fill={e.color} style={{cursor:"pointer"}}/>)}
            </Pie><Tooltip formatter={v=>fmtBRL(v)}/><Legend onClick={e=>setDrillModal({title:e.value,items:monthTxs.filter(t=>e.value==="Receitas"?t.tipo==="receita":t.tipo==="despesa")})} wrapperStyle={{cursor:"pointer"}}/></PieChart>
          </ResponsiveContainer>
          {data.map(d=>(
            <button key={d.name} onClick={()=>setDrillModal({title:d.name,items:monthTxs.filter(t=>d.name==="Receitas"?t.tipo==="receita":t.tipo==="despesa")})} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"#F8F8F8",borderRadius:10,padding:"10px 14px",border:"1px solid #EEE",borderLeftWidth:4,borderLeftColor:d.color,cursor:"pointer",fontFamily:"inherit",width:"100%",textAlign:"left",marginBottom:8}}>
              <span style={{fontSize:13,color:C.text,fontWeight:"600"}}>{d.name}</span>
              <div style={{textAlign:"right"}}><p style={{margin:0,fontSize:13,fontWeight:"bold",color:d.color}}>{fmtV(d.value)}</p><p style={{margin:0,fontSize:11,color:"#AAA"}}>{tot>0?((d.value/tot)*100).toFixed(1):0}%</p></div>
            </button>
          ))}
        </Card>
      );
    })()}
  </>);
}

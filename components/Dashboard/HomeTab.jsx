import { Card, SmLabel, BigVal } from "../AppUI";

export function DashTab({monthTxs,receitas,despesas,resultado,saldo,month,year,MONTHS,totalObrig,C,fmtBRL,setNotaModal,openTaxation,contasPagar,dividendSummary}){
  return(<>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
      <Card><SmLabel>Receita</SmLabel><BigVal color={C.navyMid}>{fmtBRL(receitas)}</BigVal></Card>
      <Card><SmLabel>Despesas</SmLabel><BigVal color={C.red}>{fmtBRL(despesas)}</BigVal></Card>
    </div>

    <Card style={{marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <SmLabel>Saldo Atual</SmLabel>
          <p style={{margin:"2px 0 0",fontSize:11,color:"#BBB"}}>Receita - Contas a Pagar · {MONTHS[month]} {year}</p>
        </div>
        <div style={{textAlign:"right"}}>
          <p style={{margin:0,fontSize:26,fontWeight:"bold",color:saldo>=0?C.navyMid:C.red,letterSpacing:-1}}>{fmtBRL(saldo)}</p>
          <span style={{fontSize:10,background:saldo>=0?C.navyLight:C.redLight,color:saldo>=0?C.navyMid:C.red,borderRadius:6,padding:"2px 8px",fontWeight:"600"}}>
            {saldo>=0?"▲ Positivo":"▼ Negativo"}
          </span>
        </div>
      </div>
    </Card>
    <Card id="obrigacoes-mensais" style={{marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:14}}>
        <div style={{minWidth:0}}>
          <p style={{margin:0,fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>Obrigações do mês</p>
          <p style={{margin:"6px 0 0",fontSize:26,fontWeight:"bold",color:C.navyMid,letterSpacing:-0.7}}>{fmtBRL(totalObrig)}</p>
          <p style={{margin:"5px 0 0",fontSize:11,color:C.muted,lineHeight:1.45}}>DAS + INSS + IRRF PF + Contabilidade</p>
        </div>
        <button onClick={openTaxation} style={{background:"none",border:"none",padding:0,marginTop:10,color:C.navyMid,fontFamily:"inherit",fontSize:13,fontWeight:"700",cursor:"pointer",whiteSpace:"nowrap"}}>Ver Tributação ›</button>
      </div>
    </Card>
    {(()=>{
      const recMes=monthTxs.filter(t=>t.tipo==="receita");
      const emitEnv=recMes.filter(t=>t.notaGerada&&t.informadoContab);
      const emitPend=recMes.filter(t=>t.notaGerada&&!t.informadoContab);
      const naoEmit=recMes.filter(t=>!t.notaGerada);
      const nfBtns=[
        {key:"emitEnviadas",  label:"Emitidas Enviadas",  count:emitEnv.length,  color:"#27AE60",  bg:"#EAFAF1", border:"#A9DFBF"},
        {key:"emitPendentes", label:"Emitidas Pendentes", count:emitPend.length, color:C.navyMid,  bg:C.navyLight,border:"#B8DEC0"},
        {key:"pendentes",     label:"À Emitir",            count:naoEmit.length,  color:"#E67E22", bg:"#FFF8F0", border:"#F0C89A"},
      ];
      return(
        <Card style={{marginBottom:12}}>
          <SmLabel style={{marginBottom:14}}>Notas Fiscais — {MONTHS[month]}</SmLabel>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {nfBtns.map(btn=>(
              <button key={btn.key} onClick={()=>setNotaModal(btn.key)}
                style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:btn.count>0?btn.bg:"#FAFAF8",border:`1.5px solid ${btn.count>0?btn.border:"#E8E0D8"}`,borderRadius:14,padding:"14px 16px",cursor:"pointer",textAlign:"left",fontFamily:"inherit"}}>
                <div>
                  <p style={{margin:0,fontSize:13,fontWeight:"700",color:btn.count>0?btn.color:"#CCC"}}>{btn.label}</p>
                  <p style={{margin:"2px 0 0",fontSize:10,color:btn.count>0?btn.color:"#CCC",opacity:0.8}}>toque para ver</p>
                </div>
                <p style={{margin:0,fontSize:28,fontWeight:"bold",color:btn.count>0?btn.color:"#CCC",lineHeight:1}}>{btn.count}</p>
              </button>
            ))}
          </div>
        </Card>
      );
    })()}
    <Card style={{marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
        <div>
          <SmLabel>Lucros & Dividendos</SmLabel>
          <p style={{margin:"5px 0 0",fontSize:22,fontWeight:"bold",color:C.gold}}>{fmtBRL(dividendSummary?.total||0)}</p>
          <p style={{margin:"3px 0 0",fontSize:10,color:C.muted}}>Distribuído no mês</p>
        </div>
        <div style={{textAlign:"right"}}>
          <p style={{margin:0,fontSize:12,fontWeight:"700",color:(dividendSummary?.taxableTotal||0)>50000?C.red:C.navyMid}}>
            {fmtBRL(Math.max(0,50000-(dividendSummary?.taxableTotal||0)))} restantes
          </p>
          <p style={{margin:"4px 0 0",fontSize:10,color:C.muted}}>limite mensal por PJ + beneficiário</p>
        </div>
      </div>
      {(dividendSummary?.irrf||0)>0 && <div style={{marginTop:10,background:C.redLight,borderRadius:10,padding:"9px 11px",fontSize:11,color:C.red,fontWeight:"700"}}>🔴 IRRF PJ estimado: {fmtBRL(dividendSummary.irrf)} · 10% sobre a distribuição sujeita à regra.</div>}
      {(dividendSummary?.groups||[]).some(g=>g.status==="proximo"||g.status==="limite") && <div style={{marginTop:10,background:"#FFF8F0",borderRadius:10,padding:"9px 11px",fontSize:11,color:"#9A6500",fontWeight:"700"}}>⚠️ Há distribuição próxima do limite mensal de R$ 50.000,00.</div>}
    </Card>
    <Card style={{marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,marginBottom:12}}>
        <div>
          <SmLabel>Contas a Pagar</SmLabel>
          <p style={{margin:"4px 0 0",fontSize:11,color:"#BBB"}}>Tributos e obrigações de {contasPagar?.competenceLabel || "mês anterior"}</p>
        </div>
        <div style={{textAlign:"right"}}>
          <p style={{margin:0,fontSize:18,fontWeight:"bold",color:C.navyMid}}>{fmtBRL(contasPagar?.total || 0)}</p>
          <p style={{margin:"2px 0 0",fontSize:9,color:C.muted}}>Total</p>
        </div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {(contasPagar?.items || []).map(item=>(
          <div key={item.label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"#FAFAF8",border:`1px solid ${C.border}`,borderRadius:12,padding:"11px 13px"}}>
            <div style={{minWidth:0}}>
              <p style={{margin:0,fontSize:13,fontWeight:"700",color:C.text}}>{item.label}</p>
              <p style={{margin:"3px 0 0",fontSize:10,color:C.muted}}>{item.timing}</p>
            </div>
            <p style={{margin:0,fontSize:13,fontWeight:"bold",color:item.amount>0?C.navyMid:"#BBB"}}>{fmtBRL(item.amount)}</p>
          </div>
        ))}
      </div>
    </Card>
  </>);
}
